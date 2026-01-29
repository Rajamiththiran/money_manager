// File: src-tauri/src/db/mod.rs
use anyhow::Result;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

pub async fn init_database_with_url(database_url: &str) -> Result<SqlitePool> {
    // Connect with create_if_missing option
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(
            database_url
                .parse::<sqlx::sqlite::SqliteConnectOptions>()?
                .create_if_missing(true),
        )
        .await?;

    // Run migrations
    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}
