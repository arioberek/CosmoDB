import type { FC } from "react";
import type { SvgProps } from "react-native-svg";
import type { DatabaseType } from "../lib/types";
import PostgresqlIcon from "../assets/icons/postgresql.svg";
import MysqlIcon from "../assets/icons/mysql.svg";
import MariadbIcon from "../assets/icons/mariadb.svg";
import SqliteIcon from "../assets/icons/sqlite.svg";
import CockroachdbIcon from "../assets/icons/cockroachdb.svg";
import MongodbIcon from "../assets/icons/mongodb.svg";

const DATABASE_ICONS: Record<DatabaseType, FC<SvgProps>> = {
  postgres: PostgresqlIcon,
  mysql: MysqlIcon,
  mariadb: MariadbIcon,
  sqlite: SqliteIcon,
  cockroachdb: CockroachdbIcon,
  mongodb: MongodbIcon,
};

type DatabaseIconProps = {
  type: DatabaseType;
  size?: number;
  color?: string;
};

export const DatabaseIcon: FC<DatabaseIconProps> = ({
  type,
  size = 32,
  color = "#ffffff",
}) => {
  const Icon = DATABASE_ICONS[type];
  return <Icon width={size} height={size} fill={color} />;
};
