#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use secureagent_desktop_lib::{commands, tray};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Set up system tray
            tray::setup_tray(app)?;

            // Hide dock icon on macOS (menu bar app)
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Ollama commands
            commands::ollama::check_ollama,
            commands::ollama::list_models,
            commands::ollama::pull_model,
            commands::ollama::chat,
            commands::ollama::chat_stream,
            // Settings commands
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_autostart,
            commands::settings::set_autostart,
            // Storage commands
            commands::storage::get_conversations,
            commands::storage::get_conversation,
            commands::storage::create_conversation,
            commands::storage::delete_conversation,
            commands::storage::get_messages,
            commands::storage::save_message,
            // Chat commands
            commands::chat::send_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
