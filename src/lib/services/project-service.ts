import User from '../types/user';
import { AccessService, IUserWithRole, RoleName } from './access-service';
import ProjectStore, { IProject } from '../db/project-store';
import EventStore from '../db/event-store';
import NameExistsError from '../error/name-exists-error';
import InvalidOperationError from '../error/invalid-operation-error';
import eventType from '../event-type';
import { nameType } from '../routes/admin-api/util';
import schema from './project-schema';
import NotFoundError from '../error/notfound-error';
import FeatureToggleStore from '../db/feature-toggle-store';
import { IRole } from '../db/access-store';

const getCreatedBy = (user: User) => user.email || user.username;

const DEFAULT_PROJECT = 'default';

export interface UsersWithRoles {
    users: IUserWithRole[];
    roles: IRole[];
}

export default class ProjectService {
    private projectStore: ProjectStore;

    private accessService: AccessService;

    private eventStore: EventStore;

    private featureToggleStore: FeatureToggleStore;

    private logger: any;

    constructor(
        { projectStore, eventStore, featureToggleStore },
        config: any,
        accessService: AccessService,
    ) {
        this.projectStore = projectStore;
        this.accessService = accessService;
        this.eventStore = eventStore;
        this.featureToggleStore = featureToggleStore;
        this.logger = config.getLogger('services/project-service.js');
    }

    async getProjects(): Promise<IProject[]> {
        return this.projectStore.getAll();
    }

    async getProject(id: number): Promise<IProject> {
        return this.projectStore.get(id);
    }

    async createProject(newProject: IProject, user: User): Promise<IProject> {
        const data = await schema.validateAsync(newProject);
        await this.validateUniqueId(data.id);

        await this.projectStore.create(data);

        await this.accessService.createDefaultProjectRoles(user, data.id);

        await this.eventStore.store({
            type: eventType.PROJECT_CREATED,
            createdBy: getCreatedBy(user),
            data,
        });

        return data;
    }

    async updateProject(updatedProject: IProject, user: User): Promise<void> {
        await this.projectStore.get(updatedProject.id);
        const project = await schema.validateAsync(updatedProject);

        await this.projectStore.update(project);

        await this.eventStore.store({
            type: eventType.PROJECT_UPDATED,
            createdBy: getCreatedBy(user),
            data: project,
        });
    }

    async deleteProject(id: string, user: User): Promise<void> {
        if (id === DEFAULT_PROJECT) {
            throw new InvalidOperationError(
                'You can not delete the default project!',
            );
        }

        const toggles = await this.featureToggleStore.getFeaturesBy({
            project: id,
            archived: 0,
        });

        if (toggles.length > 0) {
            throw new InvalidOperationError(
                'You can not delete as project with active feature toggles',
            );
        }

        await this.projectStore.delete(id);

        await this.eventStore.store({
            type: eventType.PROJECT_DELETED,
            createdBy: getCreatedBy(user),
            data: { id },
        });

        this.accessService.removeDefaultProjectRoles(user, id);
    }

    async validateId(id: string): Promise<boolean> {
        await nameType.validateAsync(id);
        await this.validateUniqueId(id);
        return true;
    }

    async validateUniqueId(id: string): Promise<void> {
        try {
            await this.projectStore.hasProject(id);
        } catch (error) {
            // No conflict, everything ok!
            return;
        }

        // Intentional throw here!
        throw new NameExistsError('A project with this id already exists.');
    }

    // RBAC methods
    async getUsersWithAccess(projectId: string): Promise<UsersWithRoles> {
        const [roles, users] = await this.accessService.getProjectRoleUsers(
            projectId,
        );

        return {
            roles,
            users,
        };
    }

    async addUser(
        projectId: string,
        roleId: number,
        userId: number,
    ): Promise<void> {
        const [roles, users] = await this.accessService.getProjectRoleUsers(
            projectId,
        );

        const role = roles.find(r => r.id === roleId);
        if (!role) {
            throw new NotFoundError(
                `Could not find roleId=${roleId} on project=${projectId}`,
            );
        }

        const alreadyHasAccess = users.some(u => u.id === userId);
        if (alreadyHasAccess) {
            throw new Error(`User already have access to project=${projectId}`);
        }

        await this.accessService.addUserToRole(userId, role.id);
    }

    async removeUser(
        projectId: string,
        roleId: number,
        userId: number,
    ): Promise<void> {
        const roles = await this.accessService.getRolesForProject(projectId);
        const role = roles.find(r => r.id === roleId);
        if (!role) {
            throw new NotFoundError(
                `Couldn't find roleId=${roleId} on project=${projectId}`,
            );
        }

        if (role.name === RoleName.ADMIN) {
            const users = await this.accessService.getUsersForRole(role.id);
            if (users.length < 2) {
                throw new Error('A project must have at least one admin');
            }
        }

        await this.accessService.removeUserFromRole(userId, role.id);
    }
}

module.exports = ProjectService;
