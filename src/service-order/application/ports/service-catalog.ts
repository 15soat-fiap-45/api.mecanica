export interface CatalogService {
    id: number;
    title: string;
    description: string | null;
    valueCents: number;
    partIds: number[];
}

export interface ServiceCatalog {
    create(input: Omit<CatalogService, 'id'>): Promise<CatalogService>;
    list(): Promise<CatalogService[]>;
    assign(orderId: string, serviceId: number): Promise<void>;
    forOrder(orderId: string): Promise<CatalogService[]>;
}
