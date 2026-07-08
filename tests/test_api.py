"""Smoke tests for the FastAPI surface — proves the pipe from Phase 0."""

from fastapi.testclient import TestClient

from helix.api.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_ws_streams_demo_timeline():
    with client.websocket_connect("/ws") as ws:
        start = ws.receive_json()
        assert start["type"] == "timeline_start"
        assert start["count"] == 3

        events = []
        while True:
            msg = ws.receive_json()
            if msg["type"] == "timeline_end":
                break
            assert msg["type"] == "event"
            events.append(msg["event"])

        assert len(events) == 3
        assert events[0]["type"] == "PACKET_SENT"
        # Timeline is time-ordered.
        assert [e["t"] for e in events] == sorted(e["t"] for e in events)
