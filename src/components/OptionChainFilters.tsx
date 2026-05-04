import React from "react";
import type { FilterType, Filters } from "../types/optionChain";

interface Props {
    filters: Filters;
    expiryDates: string[];
    typeOptions: FilterType[];
    symbolOptions: Record<FilterType, string[]>;
    onTypeChange: React.ChangeEventHandler<HTMLSelectElement>;
    onSymbolChange: React.ChangeEventHandler<HTMLSelectElement>;
    onExpiryChange: React.ChangeEventHandler<HTMLSelectElement>;
    onRefresh: () => void;
}

const OptionChainFilters: React.FC<Props> = ({
    filters,
    expiryDates,
    typeOptions,
    symbolOptions,
    onTypeChange,
    onSymbolChange,
    onExpiryChange,
    onRefresh,
}) => {
    return (
        <div
            style={{
                display: "flex",
                gap: "12px",
                marginBottom: "20px",
                flexWrap: "wrap",
            }}
        >
            <div>
                <label>Type</label>
                <br />
                <select value={filters.type} onChange={onTypeChange}>
                    {typeOptions.map((item) => (
                        <option key={item} value={item}>
                            {item}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label>Symbol</label>
                <br />
                <select value={filters.symbol} onChange={onSymbolChange}>
                    {symbolOptions[filters.type].map((item) => (
                        <option key={item} value={item}>
                            {item}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label>Expiry</label>
                <br />
                <select value={filters.expiry} onChange={onExpiryChange} disabled={expiryDates.length === 0}>
                    {expiryDates.length === 0 && (
                        <option value="">Loading expiries...</option>
                    )}
                    {expiryDates.map((item) => (
                        <option key={item} value={item}>
                            {item}
                        </option>
                    ))}
                </select>
            </div>

            <div style={{ alignSelf: "end" }}>
                <button onClick={onRefresh} disabled={!filters.expiry}>
                    Refresh
                </button>
            </div>
        </div>
    );
};

export default OptionChainFilters;