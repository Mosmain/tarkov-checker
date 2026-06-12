// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Relaunch-after-self-update: give the old instance time to exit and
    // release :47474 + the OS hotkeys before this one claims them.
    if std::env::args().any(|a| a == "--updated") {
        std::thread::sleep(std::time::Duration::from_millis(1500));
    }
    raidmate_lib::run()
}
