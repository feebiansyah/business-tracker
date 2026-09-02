import assert from "node:assert/strict";
import test from "node:test";
import { MAX_CSV_BYTES } from "./constants.ts";
import { publicImportMessage } from "./errors.ts";
import { readCsvUpload } from "./upload.ts";

function formWith(value) {
  const formData = new FormData();
  formData.set("file", value);
  return formData;
}

test("rejects invalid account IDs and missing or non-File uploads safely", async () => {
  const validFile = new File(["x"], "report.csv", { type: "text/csv" });
  for (const accountId of [0, -1, 1.5, "2"]) {
    await assert.rejects(() => readCsvUpload(accountId, formWith(validFile)), /Akun Shopee tidak valid/);
  }
  await assert.rejects(() => readCsvUpload(2, new FormData()), /File CSV wajib dipilih/);
  await assert.rejects(() => readCsvUpload(2, formWith("not-a-file")), /File CSV wajib dipilih/);
});

test("rejects non-CSV extension, unsupported MIME, and byte overflow", async () => {
  await assert.rejects(
    () => readCsvUpload(2, formWith(new File(["x"], "report.txt", { type: "text/csv" }))),
    /ekstensi \.csv/,
  );
  await assert.rejects(
    () =>
      readCsvUpload(
        2,
        formWith(new File(["x"], "report.csv", { type: "application/octet-stream" })),
      ),
    /tipe file CSV/i,
  );
  await assert.rejects(
    () =>
      readCsvUpload(
        2,
        formWith(new File([new Uint8Array(MAX_CSV_BYTES + 1)], "report.csv", { type: "text/csv" })),
      ),
    /10 MiB/,
  );
});

test("accepts locked CSV MIME types and returns sanitized in-memory bytes", async () => {
  for (const type of ["", "text/csv", "application/vnd.ms-excel"]) {
    const result = await readCsvUpload(
      2,
      formWith(new File(["abc"], "../folder/report.csv", { type })),
    );
    assert.equal(result.originalFilename, "report.csv");
    assert.deepEqual(result.bytes, new TextEncoder().encode("abc"));
  }
});

test("maps unknown failures to a safe public message", () => {
  assert.equal(publicImportMessage(new Error("database password leaked")), "Gagal memproses file CSV.");
});
