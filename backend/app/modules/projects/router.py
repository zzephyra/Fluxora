from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.api.deps import MutationDep, PrincipalDep, ProjectServiceDep, UowDep
from app.modules.projects.domain import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT
from app.modules.projects.schemas import (
    AddMemberRequest,
    CreateProjectRequest,
    MemberListResponse,
    MemberResponse,
    ProjectListResponse,
    ProjectResponse,
    UpdateProjectRequest,
)
from app.modules.projects.service import MemberPage, MemberView, ProjectPage, ProjectView

router = APIRouter(prefix="/api/v1", tags=["projects"])

LimitQuery = Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)]
CursorQuery = Annotated[str | None, Query()]


@router.get("/projects", response_model=ProjectListResponse)
async def list_projects(
    uow: UowDep,
    principal: PrincipalDep,
    service: ProjectServiceDep,
    limit: LimitQuery = DEFAULT_PAGE_LIMIT,
    cursor: CursorQuery = None,
) -> ProjectListResponse:
    page = await service.list_projects(
        uow,
        principal.user_id,
        limit=limit,
        cursor=cursor,
    )
    return _project_page(page)


@router.post("/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
    payload: CreateProjectRequest,
    uow: UowDep,
    principal: MutationDep,
    service: ProjectServiceDep,
) -> ProjectResponse:
    project = await service.create_project(uow, principal.user_id, payload.name)
    return _project_response(project)


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    uow: UowDep,
    principal: PrincipalDep,
    service: ProjectServiceDep,
) -> ProjectResponse:
    project = await service.get_project(uow, principal.user_id, project_id)
    return _project_response(project)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    payload: UpdateProjectRequest,
    uow: UowDep,
    principal: MutationDep,
    service: ProjectServiceDep,
) -> ProjectResponse:
    project = await service.update_project(
        uow,
        principal.user_id,
        project_id,
        name=payload.name,
        expected_version=payload.expected_version,
    )
    return _project_response(project)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: UUID,
    uow: UowDep,
    principal: MutationDep,
    service: ProjectServiceDep,
) -> Response:
    await service.delete_project(uow, principal.user_id, project_id)
    return Response(status_code=204)


@router.get("/projects/{project_id}/members", response_model=MemberListResponse)
async def list_members(
    project_id: UUID,
    uow: UowDep,
    principal: PrincipalDep,
    service: ProjectServiceDep,
    limit: LimitQuery = DEFAULT_PAGE_LIMIT,
    cursor: CursorQuery = None,
) -> MemberListResponse:
    page = await service.list_members(
        uow,
        principal.user_id,
        project_id,
        limit=limit,
        cursor=cursor,
    )
    return _member_page(page)


@router.post("/projects/{project_id}/members", response_model=MemberResponse, status_code=201)
async def add_member(
    project_id: UUID,
    payload: AddMemberRequest,
    uow: UowDep,
    principal: MutationDep,
    service: ProjectServiceDep,
) -> MemberResponse:
    member = await service.add_member(uow, principal.user_id, project_id, payload.user_id)
    return _member_response(member)


@router.delete("/projects/{project_id}/members/{user_id}", status_code=204)
async def remove_member(
    project_id: UUID,
    user_id: UUID,
    uow: UowDep,
    principal: MutationDep,
    service: ProjectServiceDep,
) -> Response:
    await service.remove_member(uow, principal.user_id, project_id, user_id)
    return Response(status_code=204)


def _project_response(project: ProjectView) -> ProjectResponse:
    return ProjectResponse(
        id=project.id,
        name=project.name,
        role=project.role,
        version=project.version,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


def _project_page(page: ProjectPage) -> ProjectListResponse:
    return ProjectListResponse(
        items=[_project_response(item) for item in page.items],
        next_cursor=page.next_cursor,
    )


def _member_response(member: MemberView) -> MemberResponse:
    return MemberResponse(user_id=member.user_id, email=member.email, role=member.role)


def _member_page(page: MemberPage) -> MemberListResponse:
    return MemberListResponse(
        items=[_member_response(item) for item in page.items],
        next_cursor=page.next_cursor,
    )
