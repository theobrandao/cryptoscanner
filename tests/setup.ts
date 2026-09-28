// Ambiente de testes: sem banco, sem Redis, provedores mockados por teste.
Object.assign(process.env, { NODE_ENV: "test" });
process.env.AUTH_SECRET = "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres";
process.env.LLM_PROVIDER = "none";
process.env.LOG_LEVEL = "error";
// String vazia (não `delete`): o carregador de .env do Next.js não sobrescreve chaves já definidas.
process.env.DATABASE_URL = "";
process.env.REDIS_URL = "";
