#!/usr/bin/env bun
import { expect, test, type Page } from '@playwright/test';
import { writeFileSync, appendFileSync } from 'node:fs';
import { doctor } from './doctor';
import { MADE_UP_SEA } from '../../playwright.config';
import type { Trip } from '../../src/lib/features/trip/types';

const readTrips = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Trip[]>((resolve, reject) => {
        const request = indexedDB.open('krab');
        request.onerror = () => {
          reject(new Error('Cannot read Krab IndexedDB'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction('trips', 'readonly')
            .objectStore('trips')
            .getAll();
          read.onsuccess = () => {
            resolve(read.result as Trip[]);
            db.close();
          };
          read.onerror = () => {
            reject(new Error('Cannot read trips'));
            db.close();
          };
        };
      })
  );

for (const entry of ['Map', 'Gear']) {
  test(`placing a drop from ${entry} survives reload`, async ({
    page,
    context
  }, info) => {
    const log = (action: string) => {
      appendFileSync(
        info.outputPath('actions.jsonl'),
        JSON.stringify({
          at: new Date().toISOString(),
          feature: 'placing-drop',
          entry,
          action
        }) + '\n'
      );
    };
    const capture = async (name: string) => {
      await page.screenshot({ path: info.outputPath(`${name}.png`) });
      writeFileSync(
        info.outputPath(`${name}.aria.txt`),
        await page.locator('body').ariaSnapshot()
      );
    };
    writeFileSync(
      info.outputPath('doctor.json'),
      JSON.stringify(doctor(), null, 2)
    );
    log('doctor passed: our preview process owns 4173');
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Krab needs your location' })
    ).toBeVisible();
    await capture('01-location-explanation');
    log(
      'fresh iPhone WebKit context; grant geolocation with made-up mid-ocean position'
    );
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...MADE_UP_SEA, accuracy: 8 });
    await page.getByRole('button', { name: 'Turn on location' }).click();
    log('acknowledge location explanation');
    if (entry === 'Gear')
      await page.getByRole('button', { name: 'Gear', exact: true }).click();
    await capture('02-before-drop');
    await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Pot 1 dropped');
    log('tap Drop pot; saved toast visible');
    await capture('03-dropped');
    await page.getByRole('button', { name: 'Gear', exact: true }).click();
    const row = page
      .getByRole('main')
      .getByRole('listitem')
      .filter({ hasText: 'Pot 1' });
    await expect(row).toContainText('0 ft');
    log('Gear lists Pot 1 at 0 ft');
    const before = await readTrips(page);
    expect(before).toHaveLength(1);
    expect(before[0]?.drops[0]?.position).toEqual({
      lat: MADE_UP_SEA.latitude,
      lon: MADE_UP_SEA.longitude,
      accuracyM: 8
    });
    writeFileSync(
      info.outputPath('indexeddb-before.json'),
      JSON.stringify(before, null, 2)
    );
    await capture('04-gear');
    await page.reload();
    await page.getByRole('button', { name: 'Gear', exact: true }).click();
    await expect(row).toContainText('0 ft');
    const after = await readTrips(page);
    expect(after).toEqual(before);
    writeFileSync(
      info.outputPath('indexeddb-after.json'),
      JSON.stringify(after, null, 2)
    );
    log('reload; Pot 1 remains; read-only IndexedDB matches pre-reload state');
    await capture('05-restored');
  });
}
