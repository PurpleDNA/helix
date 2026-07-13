from fastapi import WebSocket, WebSocketDisconnect,  APIRouter, Depends
from pydantic import BaseModel, Field
from ..protocols.__init__ import REGISTRY

router = APIRouter(prefix="/ws/rdt-protocols")

class RDTParams(BaseModel):
    protocol: str
    n_messages: int = Field(20, ge=1)
    loss: float = Field(0.2, ge=0.0, lt=1.0)
    corrupt: float = Field(0.1, ge=0.0, le=1.0)
    seed: int = 0
    window: int = Field(1, ge=1)
    rto: float = Field(20.0, gt=0.0)

@router.websocket("/")
async def rdt_ws(websocket: WebSocket, params: RDTParams = Depends()) -> None:
    desired_proto = REGISTRY.get(params.protocol)
    if desired_proto is None:
        await websocket.accept()
        await websocket.send_json(
            {"type": "error", "message": f"unknown protocol: {params.protocol!r}"}
        )
        await websocket.close()
        return

    kwargs = params.model_dump(exclude={"protocol"})
    protocol_instance = desired_proto(**kwargs)
    timeline = protocol_instance.run()

    await websocket.accept()
    try:
        await websocket.send_json({"type": "timeline_start", "count": len(timeline)})
        for event in timeline:
            await websocket.send_json({"type": "event", "event": event})
        await websocket.send_json({"type": "timeline_end"})
    except WebSocketDisconnect:
        return
    
    