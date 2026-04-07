use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Settings {
    pub theme: String,
    pub default_model: String,
    pub autostart: bool,
    pub global_shortcut: String,
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let db = get_db(&app).await?;

    let rows: Vec<(String, String)> = sqlx_query(&db, "SELECT key, value FROM settings")
        .await
        .map_err(|e| e.to_string())?;

    let mut settings = Settings::default();
    let map: HashMap<String, String> = rows.into_iter().collect();

    if let Some(v) = map.get("theme") {
        settings.theme = v.clone();
    }
    if let Some(v) = map.get("default_model") {
        settings.default_model = v.clone();
    }
    if let Some(v) = map.get("autostart") {
        settings.autostart = v == "true";
    }
    if let Some(v) = map.get("global_shortcut") {
        settings.global_shortcut = v.clone();
    }

    Ok(settings)
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let db = get_db(&app).await?;

    let pairs = vec![
        ("theme", settings.theme),
        ("default_model", settings.default_model),
        ("autostart", settings.autostart.to_string()),
        ("global_shortcut", settings.global_shortcut),
    ];

    for (key, value) in pairs {
        sqlx_execute(
            &db,
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            vec![key.to_string(), value],
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_setting(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let db = get_db(&app).await?;

    let rows: Vec<(String,)> =
        sqlx_query(&db, &format!("SELECT value FROM settings WHERE key = '{}'", key))
            .await
            .map_err(|e| e.to_string())?;

    Ok(rows.first().map(|(v,)| v.clone()))
}

#[tauri::command]
pub async fn set_setting(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let db = get_db(&app).await?;

    sqlx_execute(
        &db,
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        vec![key, value],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_autostart(app: AppHandle) -> Result<bool, String> {
    let autostart = app.autolaunch();
    autostart.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let autostart = app.autolaunch();

    if enabled {
        autostart.enable().map_err(|e| e.to_string())?;
    } else {
        autostart.disable().map_err(|e| e.to_string())?;
    }

    // Also save to settings
    set_setting(app, "autostart".to_string(), enabled.to_string()).await?;

    Ok(())
}

// Helper functions to work with tauri-plugin-sql
// In production, you'd use the actual SQL plugin API
async fn get_db(_app: &AppHandle) -> Result<String, String> {
    // The database path is managed by tauri-plugin-sql
    Ok("secureagent.db".to_string())
}

async fn sqlx_query<T>(_db: &str, _query: &str) -> Result<Vec<T>, String>
where
    T: Default,
{
    // This is a placeholder - actual implementation uses tauri-plugin-sql
    // The real queries are executed via the frontend using @tauri-apps/plugin-sql
    Ok(vec![])
}

async fn sqlx_execute(_db: &str, _query: &str, _params: Vec<String>) -> Result<(), String> {
    // This is a placeholder - actual implementation uses tauri-plugin-sql
    Ok(())
}
