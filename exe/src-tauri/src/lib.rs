mod commands;
mod db;
mod browser;
mod adapters;
mod scheduler;
mod content;
mod crypto;

use std::sync::Arc;
use tauri::Manager;

struct AppState {
    db: Arc<db::Db>,
    scheduler: Arc<scheduler::Scheduler>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = Arc::new(db::Db::open("app.db"));
    let scheduler = scheduler::Scheduler::new(db.clone(), 5); // 默认并发 5
    let state = AppState { db, scheduler: scheduler.clone() };
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            app.state::<AppState>().scheduler.set_app(handle);
            Ok(())
        })
        .manage(state)
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::verify_license,
            commands::list_accounts,
            commands::add_account,
            commands::begin_account_login,
            commands::fetch_account_profile,
            commands::finish_account_login,
            commands::cancel_account_login,
            commands::publish_article,
            commands::enqueue_task,
            commands::list_tasks,
            commands::start_scheduler,
            commands::stop_scheduler,
            commands::resume_task,
            commands::open_account_browser,
            commands::set_dedup_mode,
            commands::list_articles,
            commands::upsert_article,
            commands::delete_article,
            commands::list_drafts,
            commands::upsert_draft,
            commands::delete_draft,
            commands::list_images,
            commands::upsert_image,
            commands::delete_image,
            commands::reload_selectors,
            commands::selector_paths,
            commands::self_test,
            commands::open_deepseek,
            commands::generate_ai_article,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
