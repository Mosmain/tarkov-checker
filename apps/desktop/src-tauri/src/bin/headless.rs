// Headless backend: runs the HTTP server + watchers without the Tauri window.
// No windows_subsystem attribute — keep a console so logs and Ctrl+C work.
fn main() {
    raidmate_lib::run_headless();
}
