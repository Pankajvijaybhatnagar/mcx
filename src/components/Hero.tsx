import React, { useCallback, useEffect, useState } from "react";
import OptionChainService from "../services/optionchainServices";
import OptionChainFilters from "./OptionChainFilters";
import OptionChainTable from "./OptionChainTable";
import type { Filters, FilterType, OptionChainRow } from "../types/optionChain";

const Hero: React.FC = () => {
    const [filters, setFilters] = useState<Filters>({
        type: "Indices",
        symbol: "NIFTY",
        expiry: "30-Apr-2026",
    });

    const [expiryDates, setExpiryDates] = useState<string[]>([]);
    const [optionChain, setOptionChain] = useState<OptionChainRow[]>([]);
    const [loading, setLoading] = useState<boolean>(false);

    const typeOptions: FilterType[] = ["Indices", "Stocks", "MCX"];

    const symbolOptions: Record<FilterType, string[]> = {
        Indices: ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"],
        Stocks: ["RELIANCE", "SBIN", "TCS", "INFY", "HDFCBANK"],
        MCX: ["GOLD", "GOLDM", "SILVER", "SILVERM", "CRUDEOIL", "NATURALGAS", "COPPER", "ZINC", "LEAD", "ALUMINIUM"],
    };

    const updateFilters = (key: keyof Filters, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const loadExpiryDates = async (updatedFilters: Filters) => {
        try {
            const dates = await OptionChainService.fetchExpiryDates(updatedFilters);
            setExpiryDates(dates || []);

            if (dates?.length) {
                // Set expiry FIRST — option chain will load via the expiry useEffect
                setFilters((prev) => ({ ...prev, expiry: dates[0] }));
            }
        } catch (error) {
            console.error("Error loading expiry dates:", error);
        }
    };

    const loadOptionChain = async (updatedFilters: Filters = filters) => {
        // Guard: never fire with empty expiry
        if (!updatedFilters.expiry) return;

        try {
            setLoading(true);
            const data = await OptionChainService.fetchFormattedOptionChain(updatedFilters);
            setOptionChain(data || []);
        } catch (error) {
            console.error("Error loading option chain:", error);
        } finally {
            setLoading(false);
        }
    };

    // Only passed to OptionChainTable when expiry is valid
    const fetchOptionChain = useCallback(async (): Promise<OptionChainRow[]> => {
        // Hard guard — never poll with empty expiry
        if (!filters.expiry) return [];

        try {
            return (await OptionChainService.fetchFormattedOptionChain(filters)) ?? [];
        } catch (error) {
            console.error("Error fetching option chain for auto-refresh:", error);
            return [];
        }
    }, [filters]);

    // ─── Handlers ──────────────────────────────────────────────────────────

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const nextType = e.target.value as FilterType;
        const nextSymbol = symbolOptions[nextType][0];

        // Clear stale data immediately
        setOptionChain([]);
        setExpiryDates([]);

        // Reset expiry to "" — loadExpiryDates (triggered by useEffect) will populate it
        setFilters({
            type: nextType,
            symbol: nextSymbol,
            expiry: "",
        });
    };

    const handleSymbolChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setOptionChain([]);
        setExpiryDates([]);

        setFilters((prev) => ({
            ...prev,
            symbol: e.target.value,
            expiry: "",
        }));
    };

    const handleExpiryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        updateFilters("expiry", e.target.value);
    };

    // ─── Effects ──────────────────────────────────────────────────────────

    useEffect(() => {
        loadExpiryDates(filters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.type, filters.symbol]);

    useEffect(() => {
        if (filters.expiry) {
            loadOptionChain(filters);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.expiry]);

    return (
        <div style={{ padding: "20px" }}>
            <h2>Option Chain Dashboard</h2>
            <OptionChainFilters
                filters={filters}
                expiryDates={expiryDates}
                typeOptions={typeOptions}
                symbolOptions={symbolOptions}
                onTypeChange={handleTypeChange}
                onSymbolChange={handleSymbolChange}
                onExpiryChange={handleExpiryChange}
                onRefresh={() => loadOptionChain(filters)}
            />

            {/* Conditionally mount OptionChainTable ONLY when expiry is ready.
                This is the key fix — it prevents the polling useEffect inside
                OptionChainTable from ever running with an empty expiry. */}
            {filters.expiry ? (
                <OptionChainTable
                    loading={loading}
                    optionChain={optionChain}
                    fetchOptionChain={fetchOptionChain}
                />
            ) : (
                <p style={{ color: "#94a3b8" }}>Loading expiry dates...</p>
            )}
        </div>
    );
};

export default Hero;