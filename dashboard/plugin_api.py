"""Desktop REST adapter, mounted by Hermes under this plugin's namespace."""
import importlib.util
from pathlib import Path
from subprocess import TimeoutExpired
from fastapi import APIRouter, HTTPException

# Dashboard backends load as standalone modules. Load the adjacent shared service
# by its exact installed path; never add the package folder to global sys.path.
_spec = importlib.util.spec_from_file_location("hermes_voice_lab_service", Path(__file__).resolve().parents[1] / "voice_backend.py")
_service = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_service)
router = APIRouter()


def _call(fn, *args):
    try:
        return fn(*args)
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except (OSError, RuntimeError, TimeoutExpired) as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.get("/projects/{project_id}")
def get_project(project_id: str, session_id: str):
    return {"project":_call(_service.load_project, session_id, project_id)}


@router.put("/projects/{project_id}")
def put_project(project_id: str, body: dict):
    return {"project":_call(_service.save_project, body.get("session_id"), project_id, body.get("project"))}


@router.post("/render")
def render(body: dict):
    return _call(_service.render_project, body.get("session_id"), body.get("project_id"))
