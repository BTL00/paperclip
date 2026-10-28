use serde_json::{json, Value};

use crate::local_runner::LocalRunnerError;

pub(crate) const SHUTDOWN_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

fn bounded_id(value: &Value) -> bool {
    value
        .as_str()
        .is_some_and(|id| !id.is_empty() && id.len() <= 240 && !id.chars().any(char::is_control))
}

pub(crate) fn shutdown_receipt(
    value: &Value,
    thread_id: &str,
    expected_turn_id: Option<&str>,
) -> Result<Value, LocalRunnerError> {
    let invalid = || LocalRunnerError::invalid("Cursor Cloud remote termination is unconfirmed");
    if value.get("remoteStopped") != Some(&Value::Bool(true))
        || value.get("threadId").and_then(Value::as_str) != Some(thread_id)
        || value.get("turnId").and_then(Value::as_str) != expected_turn_id
        || (value
            .get("turnId")
            .is_some_and(|turn| !turn.is_null() && !bounded_id(turn)))
    {
        return Err(invalid());
    }
    let remote_run = value.get("remoteRunId").ok_or_else(invalid)?;
    let remote_agent = value.get("remoteAgentId").unwrap_or(&Value::Null);
    if remote_run.is_null() {
        if !remote_agent.is_null() && !bounded_id(remote_agent) {
            return Err(invalid());
        }
        return Ok(json!({
            "schema": "paperclip.cursor-cloud.stop-receipt.v1",
            "remoteStopped": true, "threadId": thread_id, "turnId": expected_turn_id,
            "remoteAgentId": remote_agent, "remoteRunId": Value::Null,
        }));
    }
    if !bounded_id(remote_run)
        || !bounded_id(remote_agent)
        || !matches!(
            value.get("status").and_then(Value::as_str),
            Some("CANCELLED" | "FINISHED" | "ERROR" | "EXPIRED")
        )
    {
        return Err(invalid());
    }
    Ok(json!({
        "schema": "paperclip.cursor-cloud.stop-receipt.v1",
        "remoteStopped": true, "threadId": thread_id, "turnId": expected_turn_id,
        "remoteAgentId": remote_agent, "remoteRunId": remote_run, "status": value["status"],
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_stop_requires_exact_local_identity_and_an_authoritative_remote_terminal() {
        let receipt = json!({ "remoteStopped": true, "threadId": "thread-1", "turnId": "turn-1",
            "remoteAgentId": "agent-remote", "remoteRunId": "run-remote", "status": "CANCELLED" });
        assert_eq!(
            shutdown_receipt(&receipt, "thread-1", Some("turn-1")).unwrap()["remoteRunId"],
            "run-remote"
        );
        for (field, value) in [
            ("threadId", json!("stale-thread")),
            ("turnId", json!("stale-turn")),
            ("remoteStopped", json!(false)),
            ("remoteStopped", json!("true")),
            ("remoteRunId", json!("")),
            ("remoteAgentId", Value::Null),
            ("status", json!("RUNNING")),
            ("status", json!("CANCEL_REQUESTED")),
        ] {
            let mut invalid = receipt.clone();
            invalid[field] = value;
            assert!(
                shutdown_receipt(&invalid, "thread-1", Some("turn-1")).is_err(),
                "{field}"
            );
        }
    }

    #[test]
    fn no_remote_start_requires_an_explicit_null_identity_and_exact_local_scope() {
        let receipt = json!({ "remoteStopped": true, "threadId": "thread-1", "turnId": "turn-1", "remoteRunId": null });
        assert!(shutdown_receipt(&receipt, "thread-1", Some("turn-1")).is_ok());
        let mut missing = receipt;
        missing.as_object_mut().unwrap().remove("remoteRunId");
        assert!(shutdown_receipt(&missing, "thread-1", Some("turn-1")).is_err());
    }
}
