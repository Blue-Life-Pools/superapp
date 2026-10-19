import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualityFindingsPayload, qualityVisitInput, qualityVisitInstant } from '../src/qualityInspectionPayload.ts';
import { paginateProperties } from '../src/propertyPagination.ts';

const original = { id: 'finding', title: 'Chemical readings alert', description: 'Automatic chemical alert: old reading', severity: 'HIGH', status: 'RESOLVED', requiresEstimate: false, responsibleName: 'Supervisor', resolution: 'Completed', resolvedAt: '2026-09-20T15:00:00Z', estimateNumber: 'E-123', estimateSentAt: '2026-09-19T15:00:00Z', photos: [{ name: 'photo.jpg', type: 'image/jpeg', data: 'photo' }], inspectionId: 'response-only', createdAt: 'response-only', resolvedByName: 'Original user' };
const alerts = [{ message: 'Chlorine: 0', level: 'alert' }];
test('automatic reading regeneration preserves estimate and follow-up edits', () => {
  const [saved] = qualityFindingsPayload([{ ...original, requiresEstimate: true }], alerts, [original]);
  assert.equal(saved.requiresEstimate, true);
  assert.equal(saved.id, original.id);
  assert.equal(saved.status, 'RESOLVED');
  assert.equal(saved.description, 'Automatic chemical alert: Chlorine: 0');
  assert.equal(saved.resolution, 'Completed');
  assert.equal(saved.estimateNumber, 'E-123');
  for (const key of ['inspectionId', 'createdAt', 'resolvedByName', 'photosChanged', 'photos']) assert.equal(key in saved, false, `Do not send ${key} back to the strict API`);
});
test('manual description and severity edits survive regeneration', () => {
  const [saved] = qualityFindingsPayload([{ ...original, description: 'User description', severity: 'MEDIUM', requiresEstimate: true }], alerts, [original]);
  assert.equal(saved.description, 'User description');
  assert.equal(saved.severity, 'MEDIUM');
  assert.equal(saved.requiresEstimate, true);
});
test('new automatic alerts default to no estimate but are editable afterward', () => {
  const [saved] = qualityFindingsPayload([], alerts);
  assert.equal(saved.requiresEstimate, false);
  assert.equal(saved.status, 'OPEN');
  assert.deepEqual(saved.photos, []);
});
test('existing workflow is not discarded if readings are brought into range', () => {
  const [saved] = qualityFindingsPayload([{ ...original, requiresEstimate: true }], [], [original]);
  assert.equal(saved.id, original.id);
  assert.equal(saved.requiresEstimate, true);
});
test('new finding photos are included only when changed', () => {
  const photos = [...original.photos, { name: 'new.jpg', type: 'image/jpeg', data: 'new' }];
  const [saved] = qualityFindingsPayload([{ ...original, photos, photosChanged: true }], alerts, [original]);
  assert.deepEqual(saved.photos, photos);
});
test('reopening and saving does not shift the inspection time', () => {
  const instant = '2026-10-01T02:15:00.000Z';
  assert.equal(qualityVisitInput(instant), '2026-09-30T21:15');
  assert.equal(qualityVisitInstant(qualityVisitInput(instant)), instant);
});
test('Home renders one page while keeping all properties available to filters', () => {
  const rows = Array.from({ length: 722 }, (_, id) => ({ id }));
  const first = paginateProperties(rows, 1);
  assert.equal(first.items.length, 24);
  assert.equal(first.pageCount, 31);
  assert.deepEqual([first.from, first.to, first.total], [1, 24, 722]);
  const second = paginateProperties(rows, 2);
  assert.equal(second.items[0].id, 24);
  const last = paginateProperties(rows, 31);
  assert.deepEqual(last.items.map((row) => row.id), [720, 721]);
  assert.equal(rows.length, 722);
  assert.equal(paginateProperties(rows.filter((row) => row.id > 718), 31).page, 1);
  assert.equal(paginateProperties(rows, 1, 48).items.length, 48);
  assert.equal(paginateProperties([], 99).from, 0);
});
