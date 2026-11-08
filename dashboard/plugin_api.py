"""Desktop REST routes, mounted by Hermes at /api/plugins/hermes-voice-lab."""
import importlib.util
from pathlib import Path
from subprocess import TimeoutExpired

from fastapi import APIRouter, HTTPException

# Dashboard backends load as standalone modules: import the shared service by
# its exact installed path instead of adding the package folder to sys.path.
_spec = importlib.util.spec_from_file_location("hermes_voice_lab_service", Path(__file__).resolve().parents[1] / "voice_backend.py")
_service = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_service)
router = APIRouter()


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except (OSError, RuntimeError, TimeoutExpired) as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.get("/meta")
def meta():
    return {"catalog": _call(_service.catalog), "node": _service.node_binary() is not None}


@router.get("/projects/{project_id}")
def get_project(project_id: str, session_id: str):
    return {"project": _call(_service.load_project, session_id, project_id)}


@router.put("/projects/{project_id}")
def put_project(project_id: str, body: dict):
    project = _call(_service.save_project, body.get("session_id"), project_id, body.get("project"),
                    origin="desktop", client=body.get("client"))
    return {"project": project}


@router.post("/render")
def render(body: dict):
    session_id = body.get("session_id")
    _call(_service.identity, session_id, "session_id")
    return _call(_service.render_project, session_id, body.get("project"), body.get("mode"), label="export")
