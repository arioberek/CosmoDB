import { Center, Input, NativeBaseProvider } from "native-base";
import React from "react";

export default function App() {
  return (
    <NativeBaseProvider>
      <Center flex={1} maxW="80%" mx="auto">
        <Input variant="filled" placeholder="Type Your Query" />
      </Center>
    </NativeBaseProvider>
  );
}
