"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const sharp = require("sharp");
const config = require("../config");
const { getTenantProductImage, removeTenantProductImage, saveTenantProductImage } = require("../tenant-assets");

test("normaliza WebP, crea miniatura y aisla el mismo producto entre empresas", async () => {
  const previousUploadsDir = config.uploadsDir;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fd-product-images-"));
  config.uploadsDir = root;
  try {
    const sourceA = await sharp({ create: { width: 480, height: 300, channels: 3, background: "#117766" } }).png().toBuffer();
    const sourceB = await sharp({ create: { width: 300, height: 480, channels: 3, background: "#bb5522" } }).jpeg().toBuffer();
    const savedA = await saveTenantProductImage("company-a", "product-1", { mimeType: "image/png", base64: sourceA.toString("base64") });
    const savedB = await saveTenantProductImage("company-b", "product-1", { mimeType: "image/jpeg", base64: sourceB.toString("base64") });

    assert.notEqual(savedA.imageVersion, savedB.imageVersion);
    assert.equal(savedA.imageMimeType, "image/webp");
    const imageA = getTenantProductImage("company-a", "product-1", "image");
    const thumbA = getTenantProductImage("company-a", "product-1", "thumbnail");
    const imageB = getTenantProductImage("company-b", "product-1", "image");
    assert.ok(imageA && thumbA && imageB);
    assert.notEqual(imageA.filePath, imageB.filePath);
    assert.equal((await sharp(imageA.buffer()).metadata()).format, "webp");
    const thumbMetadata = await sharp(thumbA.buffer()).metadata();
    assert.equal(thumbMetadata.width, 192);
    assert.equal(thumbMetadata.height, 192);

    const replacement = await sharp({ create: { width: 220, height: 220, channels: 3, background: "#1133aa" } }).png().toBuffer();
    const replacedA = await saveTenantProductImage("company-a", "product-1", { mimeType: "image/png", base64: replacement.toString("base64") });
    assert.notEqual(replacedA.imageVersion, savedA.imageVersion);
    assert.ok(getTenantProductImage("company-a", "product-1", "thumbnail", savedA.imageVersion));
    assert.ok(getTenantProductImage("company-a", "product-1", "thumbnail", replacedA.imageVersion));

    removeTenantProductImage("company-a", "product-1");
    assert.equal(getTenantProductImage("company-a", "product-1"), null);
    assert.ok(getTenantProductImage("company-b", "product-1"));
  } finally {
    config.uploadsDir = previousUploadsDir;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rechaza contenido que no es una imagen aunque declare un MIME permitido", async () => {
  const previousUploadsDir = config.uploadsDir;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fd-invalid-product-image-"));
  config.uploadsDir = root;
  try {
    await assert.rejects(
      () => saveTenantProductImage("company-a", "product-2", { mimeType: "image/png", base64: Buffer.from("not-an-image").toString("base64") }),
      (error) => error?.statusCode === 400
    );
  } finally {
    config.uploadsDir = previousUploadsDir;
    await fs.rm(root, { recursive: true, force: true });
  }
});
