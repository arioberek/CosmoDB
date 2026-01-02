declare module "*.svg" {
  import type { SvgProps } from "react-native-svg";
  import type { FC } from "react";
  const content: FC<SvgProps>;
  export default content;
}
