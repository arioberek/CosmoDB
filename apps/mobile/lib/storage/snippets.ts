import * as SecureStore from "expo-secure-store";

const SNIPPETS_KEY = "cosmq_query_snippets";

export interface QuerySnippet {
  id: string;
  name: string;
  query: string;
  createdAt: number;
}

/**
 * Simple promise-based mutex for serializing read-modify-write operations.
 * Prevents lost updates when multiple snippet operations run concurrently.
 */
class SnippetsMutex {
  private _locked = false;
  private _queue: (() => void)[] = [];

  async acquire(): Promise<void> {
    if (!this._locked) {
      this._locked = true;
      return;
    }

    return new Promise((resolve) => {
      this._queue.push(resolve);
    });
  }

  release(): void {
    const next = this._queue.shift();
    if (next) {
      next();
    } else {
      this._locked = false;
    }
  }
}

const snippetsMutex = new SnippetsMutex();

export const getSnippets = async (): Promise<QuerySnippet[]> => {
  try {
    const data = await SecureStore.getItemAsync(SNIPPETS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error("[getSnippets] Failed to read snippets from storage:", err);
    return [];
  }
};

export const saveSnippet = async (
  item: Omit<QuerySnippet, "id" | "createdAt">
): Promise<void> => {
  await snippetsMutex.acquire();
  try {
    const snippets = await getSnippets();
    const newSnippet: QuerySnippet = {
      ...item,
      id: `snip_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
    };
    snippets.unshift(newSnippet);
    await SecureStore.setItemAsync(SNIPPETS_KEY, JSON.stringify(snippets));
  } catch (err) {
    console.error("[saveSnippet] Failed to save snippet:", err);
    throw new Error(
      `Failed to save snippet: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  } finally {
    snippetsMutex.release();
  }
};

export const deleteSnippet = async (id: string): Promise<void> => {
  await snippetsMutex.acquire();
  try {
    const snippets = await getSnippets();
    const filtered = snippets.filter((s) => s.id !== id);
    await SecureStore.setItemAsync(SNIPPETS_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error("[deleteSnippet] Failed to delete snippet:", err);
    throw new Error(
      `Failed to delete snippet: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  } finally {
    snippetsMutex.release();
  }
};

export const clearSnippets = async (): Promise<void> => {
  await snippetsMutex.acquire();
  try {
    await SecureStore.deleteItemAsync(SNIPPETS_KEY);
  } catch (err) {
    console.error("[clearSnippets] Failed to clear snippets:", err);
    throw err;
  } finally {
    snippetsMutex.release();
  }
};
