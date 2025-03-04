'use strict';

import { createTestConfig } from '../../test/config/test-config';

const test = require('ava');
const supertest = require('supertest');
const { EventEmitter } = require('events');
const store = require('../../test/fixtures/store');
const getApp = require('../app');
const { createServices } = require('../services');

const eventBus = new EventEmitter();

function getSetup() {
    const base = `/random${Math.round(Math.random() * 1000)}`;
    const stores = store.createStores();
    const config = createTestConfig({
        server: { baseUriPath: base },
    });
    const services = createServices(stores, config);
    const app = getApp(config, stores, services, eventBus);

    return {
        base,
        request: supertest(app),
    };
}

test('api defintion', t => {
    t.plan(5);
    const { request, base } = getSetup();
    return request
        .get(`${base}/api/`)
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(res => {
            t.truthy(res.body);
            const { admin, client } = res.body.links;
            t.true(admin.uri === '/api/admin');
            t.true(client.uri === '/api/client');
            t.true(
                admin.links['feature-toggles'].uri === '/api/admin/features',
            );
            t.true(client.links.metrics.uri === '/api/client/metrics');
        });
});

test('admin api defintion', t => {
    t.plan(2);
    const { request, base } = getSetup();
    return request
        .get(`${base}/api/admin`)
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(res => {
            t.truthy(res.body);
            t.true(
                res.body.links['feature-toggles'].uri === '/api/admin/features',
            );
        });
});

test('client api defintion', t => {
    t.plan(2);
    const { request, base } = getSetup();
    return request
        .get(`${base}/api/client`)
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(res => {
            t.truthy(res.body);
            t.true(res.body.links.metrics.uri === '/api/client/metrics');
        });
});
