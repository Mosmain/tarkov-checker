fn main() {
    // ComCtl32 v6 manifest for every linked exe — including the lib unit-test
    // harness, which tauri-build's embedded manifest never reaches. The lib
    // statically imports v6-only symbols (SetWindowSubclass etc., via
    // tray-icon/muda); without a manifest the loader binds comctl32 v5.82 and
    // the test exe dies at startup with STATUS_ENTRYPOINT_NOT_FOUND.
    // tauri-build's own manifest (whose entire content is this same dependency
    // block) is disabled below so the bins don't get a duplicate RT_MANIFEST.
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!(
        "cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' \
         name='Microsoft.Windows.Common-Controls' version='6.0.0.0' \
         publicKeyToken='6595b64144ccf1df' language='*' processorArchitecture='*'"
    );
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest()),
    )
    .expect("failed to run tauri-build");
}
