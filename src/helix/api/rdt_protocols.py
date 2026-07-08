from fastapi import FastAPI, WebSocket, WebSocketDisconnect,  APIRouter, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from ..protocols.__init__ import REGISTRY
from ..protocols.stop_and_wait import StopAndWait

router = APIRouter(prefix="/ws/rdt-protocols")

class RDTParams(BaseModel):
    protocol: str
    n_messages: int = 20
    loss: float = Field(0.2, ge=0.0, lt=1.0)
    corrupt: float = Field(0.0, ge=0.0, le=1.0)
    seed: int = 0
    window: int = 1
    rto: float = 20.0

@router.websocket("/")
async def rdt_ws(websocket: WebSocket, params: RDTParams = Depends()) -> None:
    try:
        desired_proto = REGISTRY.get(params.protocol)
        if desired_proto is None:
            raise Exception("This is not a valid protocol")
        kwargs = params.model_dump(exclude={"protocol"})
        protocol_instance = desired_proto(**kwargs)

        timeline = protocol_instance.run()
        await websocket.accept()
        await websocket.send_json({"type": "timeline_start", "count": len(timeline)})
        for event in timeline:
            await websocket.send_json({"type": "event", "event": event})
        await websocket.send_json({"type": "timeline_end"})
    except:
        return
    
    