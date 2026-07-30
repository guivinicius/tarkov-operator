class ProviderError extends Error {
  constructor(message, { provider, status, hint }) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
    this.hint = hint;
  }
}

module.exports = { ProviderError };
