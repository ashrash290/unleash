const test = require('ava');
const dbInit = require('../helpers/database-init');
const getLogger = require('../../fixtures/no-logger');

// eslint-disable-next-line import/no-unresolved
const {
    AccessService,
    RoleName,
    ALL_PROJECTS,
} = require('../../../lib/services/access-service');
const permissions = require('../../../lib/permissions');

let db;
let stores;
let accessService;

let editorUser;
let superUser;
let editorRole;
let adminRole;
let readRole;

const createUserEditorAccess = async (name, email) => {
    const { userStore } = stores;
    const user = await userStore.insert({ name, email });
    await accessService.addUserToRole(user.id, editorRole.id);
    return user;
};

const createSuperUser = async () => {
    const { userStore } = stores;
    const user = await userStore.insert({
        name: 'Alice Admin',
        email: 'admin@getunleash.io',
    });
    await accessService.addUserToRole(user.id, adminRole.id);
    return user;
};

test.before(async () => {
    db = await dbInit('access_service_serial', getLogger);
    stores = db.stores;
    // projectStore = stores.projectStore;
    accessService = new AccessService(stores, { getLogger });
    const roles = await accessService.getRootRoles();
    editorRole = roles.find(r => r.name === RoleName.EDITOR);
    adminRole = roles.find(r => r.name === RoleName.ADMIN);
    readRole = roles.find(r => r.name === RoleName.VIEWER);

    editorUser = await createUserEditorAccess('Bob Test', 'bob@getunleash.io');
    superUser = await createSuperUser();
});

test.after(async () => {
    await db.destroy();
});

test.serial('should have access to admin addons', async t => {
    const { CREATE_ADDON, UPDATE_ADDON, DELETE_ADDON } = permissions;
    const user = editorUser;
    t.true(await accessService.hasPermission(user, CREATE_ADDON));
    t.true(await accessService.hasPermission(user, UPDATE_ADDON));
    t.true(await accessService.hasPermission(user, DELETE_ADDON));
});

test.serial('should have access to admin strategies', async t => {
    const { CREATE_STRATEGY, UPDATE_STRATEGY, DELETE_STRATEGY } = permissions;
    const user = editorUser;
    t.true(await accessService.hasPermission(user, CREATE_STRATEGY));
    t.true(await accessService.hasPermission(user, UPDATE_STRATEGY));
    t.true(await accessService.hasPermission(user, DELETE_STRATEGY));
});

test.serial('should have access to admin contexts', async t => {
    const {
        CREATE_CONTEXT_FIELD,
        UPDATE_CONTEXT_FIELD,
        DELETE_CONTEXT_FIELD,
    } = permissions;
    const user = editorUser;
    t.true(await accessService.hasPermission(user, CREATE_CONTEXT_FIELD));
    t.true(await accessService.hasPermission(user, UPDATE_CONTEXT_FIELD));
    t.true(await accessService.hasPermission(user, DELETE_CONTEXT_FIELD));
});

test.serial('should have access to create projects', async t => {
    const { CREATE_PROJECT } = permissions;
    const user = editorUser;
    t.true(await accessService.hasPermission(user, CREATE_PROJECT));
});

test.serial('should have access to update applications', async t => {
    const { UPDATE_APPLICATION } = permissions;
    const user = editorUser;
    t.true(await accessService.hasPermission(user, UPDATE_APPLICATION));
});

test.serial('should not have admin permission', async t => {
    const { ADMIN } = permissions;
    const user = editorUser;
    t.false(await accessService.hasPermission(user, ADMIN));
});

test.serial('should have project admin to default project', async t => {
    const {
        DELETE_PROJECT,
        UPDATE_PROJECT,
        CREATE_FEATURE,
        UPDATE_FEATURE,
        DELETE_FEATURE,
    } = permissions;
    const user = editorUser;
    t.true(await accessService.hasPermission(user, DELETE_PROJECT, 'default'));
    t.true(await accessService.hasPermission(user, UPDATE_PROJECT, 'default'));
    t.true(await accessService.hasPermission(user, CREATE_FEATURE, 'default'));
    t.true(await accessService.hasPermission(user, UPDATE_FEATURE, 'default'));
    t.true(await accessService.hasPermission(user, DELETE_FEATURE, 'default'));
});

test.serial('should grant member CREATE_FEATURE on all projects', async t => {
    const { CREATE_FEATURE } = permissions;
    const user = editorUser;

    await accessService.addPermissionToRole(
        editorRole.id,
        permissions.CREATE_FEATURE,
        ALL_PROJECTS,
    );

    t.true(
        await accessService.hasPermission(user, CREATE_FEATURE, 'some-project'),
    );
});

test.serial('cannot add CREATE_FEATURE without defining project', async t => {
    await t.throwsAsync(
        async () => {
            await accessService.addPermissionToRole(
                editorRole.id,
                permissions.CREATE_FEATURE,
            );
        },
        {
            instanceOf: Error,
            message: 'ProjectId cannot be empty for permission=CREATE_FEATURE',
        },
    );
});

test.serial(
    'cannot remove CREATE_FEATURE without defining project',
    async t => {
        await t.throwsAsync(
            async () => {
                await accessService.removePermissionFromRole(
                    editorRole.id,
                    permissions.CREATE_FEATURE,
                );
            },
            {
                instanceOf: Error,
                message:
                    'ProjectId cannot be empty for permission=CREATE_FEATURE',
            },
        );
    },
);

test.serial('should remove CREATE_FEATURE on all projects', async t => {
    const { CREATE_FEATURE } = permissions;
    const user = editorUser;

    await accessService.addPermissionToRole(
        editorRole.id,
        permissions.CREATE_FEATURE,
        ALL_PROJECTS,
    );

    await accessService.removePermissionFromRole(
        editorRole.id,
        permissions.CREATE_FEATURE,
        ALL_PROJECTS,
    );

    t.false(
        await accessService.hasPermission(user, CREATE_FEATURE, 'some-project'),
    );
});

test.serial('admin should be admin', async t => {
    const {
        DELETE_PROJECT,
        UPDATE_PROJECT,
        CREATE_FEATURE,
        UPDATE_FEATURE,
        DELETE_FEATURE,
        ADMIN,
    } = permissions;
    const user = superUser;
    t.true(await accessService.hasPermission(user, DELETE_PROJECT, 'default'));
    t.true(await accessService.hasPermission(user, UPDATE_PROJECT, 'default'));
    t.true(await accessService.hasPermission(user, CREATE_FEATURE, 'default'));
    t.true(await accessService.hasPermission(user, UPDATE_FEATURE, 'default'));
    t.true(await accessService.hasPermission(user, DELETE_FEATURE, 'default'));
    t.true(await accessService.hasPermission(user, ADMIN));
});

test.serial('should create default roles to project', async t => {
    const {
        DELETE_PROJECT,
        UPDATE_PROJECT,
        CREATE_FEATURE,
        UPDATE_FEATURE,
        DELETE_FEATURE,
    } = permissions;
    const project = 'some-project';
    const user = editorUser;
    await accessService.createDefaultProjectRoles(user, project);
    t.true(await accessService.hasPermission(user, UPDATE_PROJECT, project));
    t.true(await accessService.hasPermission(user, DELETE_PROJECT, project));
    t.true(await accessService.hasPermission(user, CREATE_FEATURE, project));
    t.true(await accessService.hasPermission(user, UPDATE_FEATURE, project));
    t.true(await accessService.hasPermission(user, DELETE_FEATURE, project));
});

test.serial(
    'should require name when create default roles to project',
    async t => {
        await t.throwsAsync(
            async () => {
                await accessService.createDefaultProjectRoles(editorUser);
            },
            { instanceOf: Error, message: 'ProjectId cannot be empty' },
        );
    },
);

test.serial('should grant user access to project', async t => {
    const {
        DELETE_PROJECT,
        UPDATE_PROJECT,
        CREATE_FEATURE,
        UPDATE_FEATURE,
        DELETE_FEATURE,
    } = permissions;
    const project = 'another-project';
    const user = editorUser;
    const sUser = await createUserEditorAccess(
        'Some Random',
        'random@getunleash.io',
    );
    await accessService.createDefaultProjectRoles(user, project);

    const roles = await accessService.getRolesForProject(project);

    const projectRole = roles.find(
        r => r.name === 'Member' && r.project === project,
    );
    await accessService.addUserToRole(sUser.id, projectRole.id);

    // Should be able to update feature toggles inside the project
    t.true(await accessService.hasPermission(sUser, CREATE_FEATURE, project));
    t.true(await accessService.hasPermission(sUser, UPDATE_FEATURE, project));
    t.true(await accessService.hasPermission(sUser, DELETE_FEATURE, project));

    // Should not be able to admin the project itself.
    t.false(await accessService.hasPermission(sUser, UPDATE_PROJECT, project));
    t.false(await accessService.hasPermission(sUser, DELETE_PROJECT, project));
});

test.serial('should not get access if not specifying project', async t => {
    const { CREATE_FEATURE, UPDATE_FEATURE, DELETE_FEATURE } = permissions;
    const project = 'another-project-2';
    const user = editorUser;
    const sUser = await createUserEditorAccess(
        'Some Random',
        'random22@getunleash.io',
    );
    await accessService.createDefaultProjectRoles(user, project);

    const roles = await accessService.getRolesForProject(project);

    const projectRole = roles.find(
        r => r.name === 'Member' && r.project === project,
    );
    await accessService.addUserToRole(sUser.id, projectRole.id);

    // Should not be able to update feature toggles outside project
    t.false(await accessService.hasPermission(sUser, CREATE_FEATURE));
    t.false(await accessService.hasPermission(sUser, UPDATE_FEATURE));
    t.false(await accessService.hasPermission(sUser, DELETE_FEATURE));
});

test.serial('should remove user from role', async t => {
    const { userStore } = stores;
    const user = await userStore.insert({
        name: 'Some User',
        email: 'random123@getunleash.io',
    });

    await accessService.addUserToRole(user.id, editorRole.id);

    // check user has one role
    const userRoles = await accessService.getRolesForUser(user.id);
    t.is(userRoles.length, 1);
    t.is(userRoles[0].name, RoleName.EDITOR);

    await accessService.removeUserFromRole(user.id, editorRole.id);
    const userRolesAfterRemove = await accessService.getRolesForUser(user.id);
    t.is(userRolesAfterRemove.length, 0);
});

test.serial('should return role with users', async t => {
    const { userStore } = stores;
    const user = await userStore.insert({
        name: 'Some User',
        email: 'random2223@getunleash.io',
    });

    await accessService.addUserToRole(user.id, editorRole.id);

    const roleWithUsers = await accessService.getRole(editorRole.id);

    t.is(roleWithUsers.role.name, RoleName.EDITOR);
    t.true(roleWithUsers.users.length > 2);
    t.truthy(roleWithUsers.users.find(u => u.id === user.id));
    t.truthy(roleWithUsers.users.find(u => u.email === user.email));
});

test.serial('should return role with permissions and users', async t => {
    const { userStore } = stores;
    const user = await userStore.insert({
        name: 'Some User',
        email: 'random2244@getunleash.io',
    });

    await accessService.addUserToRole(user.id, editorRole.id);

    const roleWithPermission = await accessService.getRole(editorRole.id);

    t.is(roleWithPermission.role.name, RoleName.EDITOR);
    t.true(roleWithPermission.permissions.length > 2);
    t.truthy(
        roleWithPermission.permissions.find(
            p => p.permission === permissions.CREATE_PROJECT,
        ),
    );
    t.true(roleWithPermission.users.length > 2);
});

test.serial('should return list of permissions', async t => {
    const p = await accessService.getPermissions();

    const findPerm = perm => p.find(_ => _.name === perm);

    const {
        DELETE_FEATURE,
        UPDATE_FEATURE,
        CREATE_FEATURE,
        UPDATE_PROJECT,
        CREATE_PROJECT,
    } = permissions;

    t.true(p.length > 2);
    t.is(findPerm(CREATE_PROJECT).type, 'root');
    t.is(findPerm(UPDATE_PROJECT).type, 'project');
    t.is(findPerm(CREATE_FEATURE).type, 'project');
    t.is(findPerm(UPDATE_FEATURE).type, 'project');
    t.is(findPerm(DELETE_FEATURE).type, 'project');
});

test.serial('should set root role for user', async t => {
    const { userStore } = stores;
    const user = await userStore.insert({
        name: 'Some User',
        email: 'random2255@getunleash.io',
    });

    await accessService.setUserRootRole(user.id, editorRole.id);

    const roles = await accessService.getRolesForUser(user.id);

    t.is(roles.length, 1);
    t.is(roles[0].name, RoleName.EDITOR);
});

test.serial('should switch root role for user', async t => {
    const { userStore } = stores;
    const user = await userStore.insert({
        name: 'Some User',
        email: 'random22Read@getunleash.io',
    });

    await accessService.setUserRootRole(user.id, editorRole.id);
    await accessService.setUserRootRole(user.id, readRole.id);

    const roles = await accessService.getRolesForUser(user.id);

    t.is(roles.length, 1);
    t.is(roles[0].name, RoleName.VIEWER);
});

test.serial('should not crash if user does not have permission', async t => {
    const { userStore } = stores;

    const user = await userStore.insert({
        name: 'Some User',
        email: 'random55Read@getunleash.io',
    });

    await accessService.setUserRootRole(user.id, readRole.id);

    const { UPDATE_CONTEXT_FIELD } = permissions;
    const hasAccess = await accessService.hasPermission(
        user,
        UPDATE_CONTEXT_FIELD,
    );

    t.false(hasAccess);
});
