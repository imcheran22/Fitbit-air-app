//! Android JNI bridge shim.
//!
//! Exports `Java_com_goose_app_bridge_GooseBridge_handle`, called by
//! `GooseBridge.kt` via JNI `external fun handle(request: String): String`.
//! Delegates immediately to `bridge::goose_bridge_handle_json` so all
//! dispatch logic lives in `bridge/mod.rs`, not here.
//!
//! Gated on `cfg(target_os = "android")` — not compiled for iOS or macOS.
//! The `jni` crate is similarly target-gated in Cargo.toml under
//! `[target.'cfg(target_os = "android")'.dependencies]`.

use std::ffi::CString;

use jni::JNIEnv;
use jni::objects::{JClass, JString};
use jni::sys::jstring;

// Re-use the existing C-exported bridge functions from bridge/mod.rs.
use crate::bridge::goose_bridge_free_string;
use crate::bridge::goose_bridge_handle_json;

/// JNI entry point called by GooseBridge.kt `external fun handle(request: String): String`.
///
/// Converts the Java String to a C string, delegates to `goose_bridge_handle_json`,
/// converts the result back to a Java String, and frees the Rust-allocated buffer.
///
/// # Safety
///
/// Called by the JVM on a JNI thread. The caller (JVM) guarantees:
/// - `env` is a valid `JNIEnv` pointer for the duration of this call; do not store it beyond this frame.
/// - `_class` is a local JNI class reference valid within this stack frame only.
/// - `request` is a local JNI String reference; the JVM will not concurrently mutate it.
///
/// Delegates to `goose_bridge_handle_json`; see that function's `# Safety` doc for the C FFI contract.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_com_goose_app_bridge_GooseBridge_handle(
    mut env: JNIEnv,
    _class: JClass,
    request: JString,
) -> jstring {
    // SAFETY: called by JVM on a JNI thread. `env` is valid for this call's duration,
    //   `_class` is a local class ref, and `request` is a local JNI String ref — all
    //   guaranteed by the JNI specification. `goose_bridge_handle_json` is called with
    //   a CString constructed here; its SAFETY contract is satisfied (non-null, valid
    //   UTF-8, lifetime bounded to this stack frame).
    // Convert Java String → Rust String
    let request_str: String = match env.get_string(&request) {
        Ok(s) => s.into(),
        Err(e) => {
            let error_json = format!(
                r#"{{"ok":false,"result":null,"error":{{"message":"JNI get_string failed: {e}"}},"timing":null}}"#
            );
            return match env.new_string(error_json) {
                Ok(s) => s.into_raw(),
                Err(_) => std::ptr::null_mut(),
            };
        }
    };

    // Convert Rust String → CString for goose_bridge_handle_json
    let c_request = match CString::new(request_str) {
        Ok(s) => s,
        Err(e) => {
            let error_json = format!(
                r#"{{"ok":false,"result":null,"error":{{"message":"CString conversion failed: {e}"}},"timing":null}}"#
            );
            return match env.new_string(error_json) {
                Ok(s) => s.into_raw(),
                Err(_) => std::ptr::null_mut(),
            };
        }
    };

    // Call the existing C-exported bridge function
    // SAFETY: c_request is a valid NUL-terminated CString; lifetime bounded to this frame.
    let response_ptr = unsafe { goose_bridge_handle_json(c_request.as_ptr()) };

    if response_ptr.is_null() {
        let error_json = r#"{"ok":false,"result":null,"error":{"message":"goose_bridge_handle_json returned null"},"timing":null}"#;
        return match env.new_string(error_json) {
            Ok(s) => s.into_raw(),
            Err(_) => std::ptr::null_mut(),
        };
    }

    // SAFETY: response_ptr is non-null (checked above) and points to a Rust CString
    //   allocated by goose_bridge_handle_json; valid until goose_bridge_free_string is called below.
    let response_str = unsafe {
        let s = std::ffi::CStr::from_ptr(response_ptr)
            .to_string_lossy()
            .into_owned();
        goose_bridge_free_string(response_ptr);
        s
    };

    // Convert Rust String → Java String
    match env.new_string(response_str) {
        Ok(s) => s.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}
