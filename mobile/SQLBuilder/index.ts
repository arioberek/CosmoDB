interface SQLBuilderOptions {
  client: string;
  connection: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
  };
  query: string;
}

export function buildSQL(options: SQLBuilderOptions) {
  const knex = require("knex")({
    client: options.client,
    connection: {
      host: options.connection.host,
      port: options.connection.port,
      user: options.connection.user,
      password: options.connection.password,
      database: options.connection.name,
    },
  });

  const query = options.query;

  return knex.raw(query);
}
