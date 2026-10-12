//! Shootcut: fonts the person adds on the site (installed fonts or font files) are handed to the app.
//! The page keeps them in `window.__shootcutFonts` (an array of Uint8Array); this takes them out
//! and registers them, so they show up in the font menus and in the text.

use wasm_bindgen::{JsCast as _, JsValue};

pub fn watch() {
    wasm_bindgen_futures::spawn_local(async {
        loop {
            for bytes in take() {
                let added = add(bytes);
                log::info!("shootcut fonts: {added} face(s) added");
            }
            sleep(300).await;
        }
    });
}

/// Everything waiting in the page's list, oldest first.
fn take() -> Vec<Vec<u8>> {
    let mut out = Vec::new();
    let Some(window) = web_sys::window() else { return out };
    let Ok(list) = js_sys::Reflect::get(&window, &JsValue::from_str("__shootcutFonts")) else { return out };
    if !js_sys::Array::is_array(&list) {
        return out;
    }
    let list: js_sys::Array = list.unchecked_into();
    loop {
        let item = list.shift();
        if item.is_undefined() || item.is_null() {
            break;
        }
        out.push(js_sys::Uint8Array::new(&item).to_vec());
    }
    out
}

async fn sleep(ms: i32) {
    let promise = js_sys::Promise::new(&mut |resolve: js_sys::Function, _reject: js_sys::Function| {
        if let Some(window) = web_sys::window() {
            let _ = window.set_timeout_with_callback_and_timeout_and_arguments_0(&resolve, ms);
        }
    });
    let _ = wasm_bindgen_futures::JsFuture::from(promise).await;
}

fn add(bytes: Vec<u8>) -> usize {
    __ADD__
}
