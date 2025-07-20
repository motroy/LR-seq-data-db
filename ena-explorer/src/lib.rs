use wasm_bindgen::prelude::*;

const ENA_DATA: &str = include_str!("../ena_data.json");

#[wasm_bindgen]
pub fn get_ena_data() -> String {
    ENA_DATA.to_string()
}
