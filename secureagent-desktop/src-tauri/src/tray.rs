use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

pub fn setup_tray<R: Runtime>(app: &tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();

    // Create menu items
    let open_item = MenuItem::with_id(handle, "open", "Open SecureAgent", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(handle, "settings", "Settings...", true, None::<&str>)?;
    let separator = MenuItem::with_id(handle, "sep", "---", false, None::<&str>)?;
    let quit_item = MenuItem::with_id(handle, "quit", "Quit", true, Some("CmdOrCtrl+Q"))?;

    // Build the menu
    let menu = Menu::with_items(
        handle,
        &[&open_item, &settings_item, &separator, &quit_item],
    )?;

    // Build the tray icon
    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                show_main_window(app);
            }
            "settings" => {
                show_settings(app);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                show_main_window(app);
            }
        })
        .build(app)?;

    Ok(())
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn show_settings<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        // Navigate to settings page
        let _ = window.eval("window.location.href = '/settings/'");
    }
}
