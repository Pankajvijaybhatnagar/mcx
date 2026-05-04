export type FilterType = "Indices" | "Stocks" | "MCX";

export interface Filters {
    type: FilterType;
    symbol: string;
    expiry: string;
}

export interface OptionChainRow {
    strikePrice: number;
    expiryDate?: string;
    CE?: Record<string, unknown> | null;
    PE?: Record<string, unknown> | null;
}