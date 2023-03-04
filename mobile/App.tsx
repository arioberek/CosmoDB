import { Button, Center, Input, NativeBaseProvider } from "native-base";
export default function App() {
  return (
    <NativeBaseProvider>
      <Center flex={1} maxW="80%" mx="auto">
        <Input
          // onChangeText={setQuery}
          variant="filled"
          placeholder="Type Your Query"
        />
        <Button
        // onPress={submit}
        >
          Run Query
        </Button>
      </Center>
    </NativeBaseProvider>
  );
}
