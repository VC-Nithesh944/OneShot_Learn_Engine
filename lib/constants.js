const parsedUploadLimit = Number.parseInt(
  process.env.FREE_DAILY_UPLOAD_LIMIT ?? "",
  10,
);

export const FREE_DAILY_UPLOAD_LIMIT =
  Number.isFinite(parsedUploadLimit) && parsedUploadLimit >= 0
    ? parsedUploadLimit
    : 2;
