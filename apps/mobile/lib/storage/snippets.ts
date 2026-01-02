import * as SecureStore from "expo-secure-store";

const SNIPPETS_KEY = "cosmq_query_snippets";

export interface QuerySnippet {
  id: string;
  name: string;
  query: string;
  createdAt: number;
}

export const getSnippets = async (): Promise<QuerySnippet[]> => {
  try {
    const data = await SecureStore.getItemAsync(SNIPPETS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveSnippet = async (
  item: Omit<QuerySnippet, "id" | "createdAt">
): Promise<void> => {
  const snippets = await getSnippets();
  const newSnippet: QuerySnippet = {
    ...item,
    id: `snip_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
  };
  snippets.unshift(newSnippet);
  await SecureStore.setItemAsync(SNIPPETS_KEY, JSON.stringify(snippets));
};

export const deleteSnippet = async (id: string): Promise<void> => {
  const snippets = await getSnippets();
  const filtered = snippets.filter((s) => s.id !== id);
  await SecureStore.setItemAsync(SNIPPETS_KEY, JSON.stringify(filtered));
};

export const clearSnippets = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(SNIPPETS_KEY);
};
