// Central error handler — every route forwards errors here via next(err)
// instead of formatting its own response, so error shape stays consistent
// and stack traces never leak to the client.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${req.method} ${req.originalUrl}`, err);
  }
  res.status(status).json({
    error: err.code || 'INTERNAL_ERROR',
    message: status >= 500 ? 'Something went wrong' : err.message,
  });
}

module.exports = errorHandler;
