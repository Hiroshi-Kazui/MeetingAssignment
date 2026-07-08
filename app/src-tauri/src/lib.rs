use std::fs;
use std::path::PathBuf;

/// data.json は実行ファイルと同じフォルダに置く（要件定義 §3:
/// アプリのフォルダごとコピーするだけで PC 移行できること）。
/// 開発時（cargo run / tauri dev）は target/debug 配下になる。
fn data_json_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("exe に親ディレクトリがありません")?;
    Ok(dir.join("data.json"))
}

/// data.json を読む。存在しなければ None（初回起動）。
#[tauri::command]
fn load_app_data() -> Result<Option<String>, String> {
    let path = data_json_path()?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

/// data.json へ書き込む（IndexedDB との二重書き込みの片翼）。
/// 破損防止のため一時ファイルに書いてからリネームする。
#[tauri::command]
fn save_app_data(json: String) -> Result<(), String> {
    let path = data_json_path()?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// ダイアログで選択されたファイル（xlsx / pdf / バックアップ JSON）を読む。
#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| e.to_string())
}

/// ダイアログで指定された保存先へ書き出す（エクスポート・バックアップ）。
#[tauri::command]
fn write_file_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(&path, data).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_app_data,
            save_app_data,
            read_file_bytes,
            write_file_bytes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
