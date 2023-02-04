import { Button, Center, Input, NativeBaseProvider } from "native-base";
import { useState } from "react";
import { Alert } from "react-native";

export default function App() {
  const [query, setQuery] = useState("");

  const options = {
    client: "pg",
    connection: {
      host: "s",
      port: 43,
      user: "s",
      password: "s",
      name: "s",
    },
  };

  function submit() {
    // buildSQL({ ...options, query });
    Alert.alert("Query", query);
  }

  return (
    <NativeBaseProvider>
      <Center flex={1} maxW="80%" mx="auto">
        <Input
          onChangeText={setQuery}
          variant="filled"
          placeholder="Type Your Query"
        />
        <Button onPress={submit}>Run Query</Button>
      </Center>
    </NativeBaseProvider>
  );
}
