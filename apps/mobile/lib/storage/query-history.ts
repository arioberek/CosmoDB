import * as SecureStore from "expo-secure-store";

const HISTORY_KEY = "cosmq_query_history";
const MAX_HISTORY = 50;

export interface QueryHistoryItem {
  id: string;
  query: string;
  connectionId: string;
  connectionName: string;
  timestamp: number;
}

class HistoryMutex {
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

const historyMutex = new HistoryMutex();

export const getQueryHistory = async (): Promise<QueryHistoryItem[]> => {
  try {
    const data = await SecureStore.getItemAsync(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error("[getQueryHistory] Failed to read query history:", err);
    return [];
  }
};

export const addToQueryHistory = async (
  item: Omit<QueryHistoryItem, "id" | "timestamp">
): Promise<void> => {
  await historyMutex.acquire();
  try {
    const history = await getQueryHistory();
    const newItem: QueryHistoryItem = {
      ...item,
      id: `qh_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    };

    const isDuplicate = history.some(
      (h) =>
        h.query.trim() === item.query.trim() &&
        h.connectionId === item.connectionId
    );
    if (isDuplicate) {
      const filtered = history.filter(
        (h) =>
          !(
            h.query.trim() === item.query.trim() &&
            h.connectionId === item.connectionId
          )
      );
      filtered.unshift(newItem);
      await SecureStore.setItemAsync(
        HISTORY_KEY,
        JSON.stringify(filtered.slice(0, MAX_HISTORY))
      );
      return;
    }

    history.unshift(newItem);
    await SecureStore.setItemAsync(
      HISTORY_KEY,
      JSON.stringify(history.slice(0, MAX_HISTORY))
    );
  } catch (err) {
    console.error("[addToQueryHistory] Failed to add query to history:", err);
  } finally {
    historyMutex.release();
  }
};

export const clearQueryHistory = async (): Promise<void> => {
  await historyMutex.acquire();
  try {
    await SecureStore.deleteItemAsync(HISTORY_KEY);
  } catch (err) {
    console.error("[clearQueryHistory] Failed to clear query history:", err);
    throw err;
  } finally {
    historyMutex.release();
  }
};
