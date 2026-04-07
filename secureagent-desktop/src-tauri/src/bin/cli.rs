use clap::{Parser, Subcommand};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
use std::process::Command;

const OLLAMA_BASE_URL: &str = "http://localhost:11434";

#[derive(Parser)]
#[command(name = "secureagent")]
#[command(about = "SecureAgent CLI - Offline AI assistant", long_about = None)]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start an interactive chat session
    Chat {
        /// Model to use for chat
        #[arg(short, long, default_value = "llama3.2")]
        model: String,
    },
    /// List available models
    Models,
    /// Open the desktop application
    Open,
    /// Check Ollama status
    Status,
    /// Pull a model from Ollama
    Pull {
        /// Name of the model to pull
        name: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatResponse {
    model: String,
    message: Message,
    done: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaModel {
    name: String,
    size: u64,
    modified_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ListModelsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VersionResponse {
    version: String,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Chat { model } => chat_interactive(&model).await,
        Commands::Models => list_models().await,
        Commands::Open => open_app(),
        Commands::Status => check_status().await,
        Commands::Pull { name } => pull_model(&name).await,
    }
}

async fn chat_interactive(model: &str) {
    println!("SecureAgent Chat (model: {})", model);
    println!("Type 'exit' or 'quit' to end the session");
    println!("-------------------------------------------\n");

    // Check if Ollama is running
    if !is_ollama_running().await {
        eprintln!("Error: Ollama is not running. Please start Ollama first.");
        eprintln!("Install: brew install ollama");
        eprintln!("Start: ollama serve");
        std::process::exit(1);
    }

    let client = Client::new();
    let mut messages: Vec<Message> = Vec::new();

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    loop {
        print!("You: ");
        stdout.flush().unwrap();

        let mut input = String::new();
        if stdin.lock().read_line(&mut input).is_err() {
            break;
        }

        let input = input.trim();
        if input.is_empty() {
            continue;
        }

        if input == "exit" || input == "quit" {
            println!("Goodbye!");
            break;
        }

        messages.push(Message {
            role: "user".to_string(),
            content: input.to_string(),
        });

        print!("\nAssistant: ");
        stdout.flush().unwrap();

        let request = ChatRequest {
            model: model.to_string(),
            messages: messages.clone(),
            stream: true,
        };

        match client
            .post(format!("{}/api/chat", OLLAMA_BASE_URL))
            .json(&request)
            .send()
            .await
        {
            Ok(response) => {
                let mut full_response = String::new();
                let mut bytes = response.bytes_stream();
                use futures_util::StreamExt;

                while let Some(chunk) = bytes.next().await {
                    match chunk {
                        Ok(chunk) => {
                            let text = String::from_utf8_lossy(&chunk);
                            for line in text.lines() {
                                if line.is_empty() {
                                    continue;
                                }
                                if let Ok(chat_response) =
                                    serde_json::from_str::<ChatResponse>(line)
                                {
                                    print!("{}", chat_response.message.content);
                                    stdout.flush().unwrap();
                                    full_response.push_str(&chat_response.message.content);
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("\nError reading response: {}", e);
                            break;
                        }
                    }
                }

                println!("\n");

                messages.push(Message {
                    role: "assistant".to_string(),
                    content: full_response,
                });
            }
            Err(e) => {
                eprintln!("\nError sending message: {}", e);
            }
        }
    }
}

async fn list_models() {
    if !is_ollama_running().await {
        eprintln!("Error: Ollama is not running. Please start Ollama first.");
        std::process::exit(1);
    }

    let client = Client::new();

    match client
        .get(format!("{}/api/tags", OLLAMA_BASE_URL))
        .send()
        .await
    {
        Ok(response) => match response.json::<ListModelsResponse>().await {
            Ok(list) => {
                if list.models.is_empty() {
                    println!("No models installed.");
                    println!("\nTo install a model, run:");
                    println!("  secureagent pull llama3.2");
                } else {
                    println!("Available models:\n");
                    for model in list.models {
                        let size_gb = model.size as f64 / 1_000_000_000.0;
                        println!("  {} ({:.1} GB)", model.name, size_gb);
                    }
                }
            }
            Err(e) => {
                eprintln!("Error parsing response: {}", e);
            }
        },
        Err(e) => {
            eprintln!("Error fetching models: {}", e);
        }
    }
}

fn open_app() {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open")
            .arg("-a")
            .arg("SecureAgent")
            .spawn();
        println!("Opening SecureAgent desktop app...");
    }

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("cmd")
            .args(["/C", "start", "", "SecureAgent"])
            .spawn();
        println!("Opening SecureAgent desktop app...");
    }

    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("secureagent-desktop").spawn();
        println!("Opening SecureAgent desktop app...");
    }
}

async fn check_status() {
    println!("Checking Ollama status...\n");

    let client = Client::new();

    match client
        .get(format!("{}/api/version", OLLAMA_BASE_URL))
        .send()
        .await
    {
        Ok(response) => match response.json::<VersionResponse>().await {
            Ok(version) => {
                println!("Ollama Status: Running");
                println!("Version: {}", version.version);
                println!("URL: {}", OLLAMA_BASE_URL);

                // Also list models
                println!("\nInstalled models:");
                match client
                    .get(format!("{}/api/tags", OLLAMA_BASE_URL))
                    .send()
                    .await
                {
                    Ok(response) => {
                        if let Ok(list) = response.json::<ListModelsResponse>().await {
                            if list.models.is_empty() {
                                println!("  (none)");
                            } else {
                                for model in list.models {
                                    println!("  - {}", model.name);
                                }
                            }
                        }
                    }
                    Err(_) => {
                        println!("  (could not fetch)");
                    }
                }
            }
            Err(e) => {
                eprintln!("Ollama Status: Error");
                eprintln!("Could not parse version: {}", e);
            }
        },
        Err(_) => {
            eprintln!("Ollama Status: Not Running");
            eprintln!("\nTo start Ollama:");
            eprintln!("  1. Install: brew install ollama");
            eprintln!("  2. Start: ollama serve");
            eprintln!("  3. Pull a model: ollama pull llama3.2");
        }
    }
}

async fn pull_model(name: &str) {
    if !is_ollama_running().await {
        eprintln!("Error: Ollama is not running. Please start Ollama first.");
        std::process::exit(1);
    }

    println!("Pulling model: {}", name);
    println!("This may take a while depending on the model size...\n");

    let client = Client::new();

    #[derive(Serialize)]
    struct PullRequest {
        name: String,
        stream: bool,
    }

    #[derive(Deserialize)]
    struct PullProgress {
        status: String,
        #[serde(default)]
        completed: Option<u64>,
        #[serde(default)]
        total: Option<u64>,
    }

    let request = PullRequest {
        name: name.to_string(),
        stream: true,
    };

    match client
        .post(format!("{}/api/pull", OLLAMA_BASE_URL))
        .json(&request)
        .send()
        .await
    {
        Ok(response) => {
            let mut bytes = response.bytes_stream();
            use futures_util::StreamExt;

            let mut last_status = String::new();

            while let Some(chunk) = bytes.next().await {
                match chunk {
                    Ok(chunk) => {
                        let text = String::from_utf8_lossy(&chunk);
                        for line in text.lines() {
                            if line.is_empty() {
                                continue;
                            }
                            if let Ok(progress) = serde_json::from_str::<PullProgress>(line) {
                                if progress.status != last_status {
                                    if let (Some(completed), Some(total)) =
                                        (progress.completed, progress.total)
                                    {
                                        let percent = (completed as f64 / total as f64) * 100.0;
                                        print!("\r{}: {:.1}%", progress.status, percent);
                                    } else {
                                        print!("\r{}", progress.status);
                                    }
                                    io::stdout().flush().unwrap();
                                    last_status = progress.status;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("\nError: {}", e);
                        break;
                    }
                }
            }

            println!("\n\nModel '{}' pulled successfully!", name);
        }
        Err(e) => {
            eprintln!("Error pulling model: {}", e);
        }
    }
}

async fn is_ollama_running() -> bool {
    let client = Client::new();
    client
        .get(format!("{}/api/version", OLLAMA_BASE_URL))
        .send()
        .await
        .is_ok()
}
