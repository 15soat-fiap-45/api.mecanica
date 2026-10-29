export type BiPermission = 'BI_VISUALIZAR';

export interface BiAuthenticatedActor {
    readonly id: string;
    can(permission: BiPermission): boolean;
}

export interface BiAccessGuard {
    authenticate(
        authorizationHeader?: string,
    ): Promise<BiAuthenticatedActor | null>;
}
