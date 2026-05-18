// File: src-tauri/src/commands/advanced.rs
use crate::models::advanced::{CategorizationRule, CreateCategorizationRuleInput, ExportTemplate, CreateExportTemplateInput};
use crate::AppState;
use rusqlite::params;
use tauri::State;

// ===================== CATEGORIZATION RULES =====================

#[tauri::command]
pub fn get_categorization_rules(state: State<'_, AppState>) -> Result<Vec<CategorizationRule>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, match_pattern, match_type, category_id, priority, created_at, updated_at 
         FROM categorization_rules ORDER BY priority DESC, created_at DESC"
    ).map_err(|e| format!("Query error: {}", e))?;

    let rules = stmt.query_map([], |row| {
        Ok(CategorizationRule {
            id: row.get(0)?,
            match_pattern: row.get(1)?,
            match_type: row.get(2)?,
            category_id: row.get(3)?,
            priority: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }).map_err(|e| format!("Execute error: {}", e))?
    .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Read error: {}", e))?;

    Ok(rules)
}

#[tauri::command]
pub fn create_categorization_rule(
    state: State<'_, AppState>,
    input: CreateCategorizationRuleInput,
) -> Result<CategorizationRule, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    conn.execute(
        "INSERT INTO categorization_rules (id, match_pattern, match_type, category_id, priority)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            input.id,
            input.match_pattern,
            input.match_type,
            input.category_id,
            input.priority
        ],
    ).map_err(|e| format!("Insert error: {}", e))?;

    let mut stmt = conn.prepare("SELECT created_at, updated_at FROM categorization_rules WHERE id = ?1").unwrap();
    let (created_at, updated_at): (String, String) = stmt.query_row(params![input.id], |row| Ok((row.get(0)?, row.get(1)?))).unwrap();

    Ok(CategorizationRule {
        id: input.id,
        match_pattern: input.match_pattern,
        match_type: input.match_type,
        category_id: input.category_id,
        priority: input.priority,
        created_at,
        updated_at,
    })
}

#[tauri::command]
pub fn update_categorization_rule(
    state: State<'_, AppState>,
    input: CreateCategorizationRuleInput,
) -> Result<CategorizationRule, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    conn.execute(
        "UPDATE categorization_rules 
         SET match_pattern = ?1, match_type = ?2, category_id = ?3, priority = ?4, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?5",
        params![
            input.match_pattern,
            input.match_type,
            input.category_id,
            input.priority,
            input.id
        ],
    ).map_err(|e| format!("Update error: {}", e))?;

    let mut stmt = conn.prepare("SELECT created_at, updated_at FROM categorization_rules WHERE id = ?1").unwrap();
    let (created_at, updated_at): (String, String) = stmt.query_row(params![input.id], |row| Ok((row.get(0)?, row.get(1)?))).unwrap();

    Ok(CategorizationRule {
        id: input.id,
        match_pattern: input.match_pattern,
        match_type: input.match_type,
        category_id: input.category_id,
        priority: input.priority,
        created_at,
        updated_at,
    })
}

#[tauri::command]
pub fn delete_categorization_rule(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    conn.execute("DELETE FROM categorization_rules WHERE id = ?1", params![id])
        .map_err(|e| format!("Delete error: {}", e))?;

    Ok(())
}

// ===================== EXPORT TEMPLATES =====================

#[tauri::command]
pub fn get_export_templates(state: State<'_, AppState>) -> Result<Vec<ExportTemplate>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, name, columns, filters, format, created_at, updated_at 
         FROM export_templates ORDER BY name ASC"
    ).map_err(|e| format!("Query error: {}", e))?;

    let templates = stmt.query_map([], |row| {
        Ok(ExportTemplate {
            id: row.get(0)?,
            name: row.get(1)?,
            columns: row.get(2)?,
            filters: row.get(3)?,
            format: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }).map_err(|e| format!("Execute error: {}", e))?
    .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Read error: {}", e))?;

    Ok(templates)
}

#[tauri::command]
pub fn create_export_template(
    state: State<'_, AppState>,
    input: CreateExportTemplateInput,
) -> Result<ExportTemplate, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    conn.execute(
        "INSERT INTO export_templates (id, name, columns, filters, format)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            input.id,
            input.name,
            input.columns,
            input.filters,
            input.format
        ],
    ).map_err(|e| format!("Insert error: {}", e))?;

    let mut stmt = conn.prepare("SELECT created_at, updated_at FROM export_templates WHERE id = ?1").unwrap();
    let (created_at, updated_at): (String, String) = stmt.query_row(params![input.id], |row| Ok((row.get(0)?, row.get(1)?))).unwrap();

    Ok(ExportTemplate {
        id: input.id,
        name: input.name,
        columns: input.columns,
        filters: input.filters,
        format: input.format,
        created_at,
        updated_at,
    })
}

#[tauri::command]
pub fn update_export_template(
    state: State<'_, AppState>,
    input: CreateExportTemplateInput,
) -> Result<ExportTemplate, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    conn.execute(
        "UPDATE export_templates 
         SET name = ?1, columns = ?2, filters = ?3, format = ?4, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?5",
        params![
            input.name,
            input.columns,
            input.filters,
            input.format,
            input.id
        ],
    ).map_err(|e| format!("Update error: {}", e))?;

    let mut stmt = conn.prepare("SELECT created_at, updated_at FROM export_templates WHERE id = ?1").unwrap();
    let (created_at, updated_at): (String, String) = stmt.query_row(params![input.id], |row| Ok((row.get(0)?, row.get(1)?))).unwrap();

    Ok(ExportTemplate {
        id: input.id,
        name: input.name,
        columns: input.columns,
        filters: input.filters,
        format: input.format,
        created_at,
        updated_at,
    })
}

#[tauri::command]
pub fn delete_export_template(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    conn.execute("DELETE FROM export_templates WHERE id = ?1", params![id])
        .map_err(|e| format!("Delete error: {}", e))?;

    Ok(())
}
