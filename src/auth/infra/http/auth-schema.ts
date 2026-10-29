import { z } from 'zod';
import { ROLES } from '../../domain/user/value-objects/role.js';

export const firstAccessBody = z
    .object({
        email: z.string().meta({
            description: 'E-mail do usuário pré-cadastrado.',
            example: 'admin@admin.com',
        }),
        temporaryPassword: z.string().meta({
            description:
                'Senha temporária recebida no pré-cadastro (ou definida em INITIAL_MANAGER_PASSWORD para o gerente inicial).',
            example: 'TempPass123',
        }),
        newPassword: z.string().meta({
            description:
                'Nova senha definitiva: mínimo de 8 caracteres, somente letras e números, diferente da temporária.',
            example: 'NovaSenha123',
        }),
    })
    .meta({ description: 'Dados para trocar a senha temporária.' });

export const loginBody = z
    .object({
        email: z.string().meta({
            description: 'E-mail do usuário ativo.',
            example: 'admin@admin.com',
        }),
        password: z.string().meta({
            description: 'Senha definitiva cadastrada no primeiro acesso.',
            example: 'NovaSenha123',
        }),
    })
    .meta({ description: 'Credenciais de acesso.' });

export const registerBody = z
    .object({
        email: z.string().meta({
            description: 'E-mail do novo usuário. Deve ser único.',
            example: 'pessoa@example.com',
        }),
        role: z.string().meta({
            description: `Papel do novo usuário. Valores aceitos: ${ROLES.join(', ')}.`,
            enum: [...ROLES],
            example: 'ATENDENTE',
        }),
    })
    .meta({ description: 'Dados do usuário a ser pré-cadastrado.' });

const messageResponse = (description: string) =>
    z
        .object({
            message: z
                .string()
                .meta({ description: 'Mensagem descrevendo o erro.' }),
        })
        .meta({ description });

const rateLimitResponse = z
    .object({
        statusCode: z.number().meta({ example: 429 }),
        error: z.string().meta({ example: 'Too Many Requests' }),
        message: z.string().meta({
            description: 'Mensagem informando quando tentar novamente.',
        }),
    })
    .meta({
        description:
            'Mais de 5 tentativas por minuto, por IP, nesta rota. Aguarde e tente novamente.',
    });

export const firstAccessResponses = {
    // `type: 'null'` makes @fastify/swagger document 204 without a body.
    204: z.null().meta({
        type: 'null',
        description:
            'Senha alterada. O usuário passa a ATIVO e já pode fazer login.',
    }),
    400: messageResponse(
        'Corpo inválido, nova senha fora das regras ou igual à temporária.',
    ),
    401: messageResponse('E-mail ou senha temporária incorretos.'),
    403: messageResponse(
        'O usuário já concluiu o primeiro acesso ou está desativado.',
    ),
    429: rateLimitResponse,
};

export const loginResponses = {
    200: z
        .object({
            token: z.string().meta({
                description:
                    'JWT (HS256) válido por 4 horas. Envie no cabeçalho Authorization: Bearer <token>.',
                example: 'eyJhbGciOiJIUzI1NiJ9...',
            }),
        })
        .meta({ description: 'Login realizado.' }),
    400: messageResponse('Corpo inválido.'),
    401: messageResponse('E-mail ou senha incorretos.'),
    403: messageResponse(
        'Primeiro acesso pendente (troque a senha temporária em /auth/first-access) ou usuário desativado.',
    ),
    429: rateLimitResponse,
};

export const registerResponses = {
    201: z
        .object({
            temporaryPassword: z.string().meta({
                description:
                    'Senha temporária gerada. Entregue ao novo usuário por um canal seguro; ele deve trocá-la em /auth/first-access.',
                example: 'TempPass123',
            }),
        })
        .meta({ description: 'Usuário pré-cadastrado.' }),
    400: messageResponse('Corpo inválido, e-mail ou papel inválidos.'),
    401: messageResponse('Token ausente, inválido ou expirado.'),
    403: messageResponse(
        'O usuário autenticado não tem a permissão USUARIO_PRE_CADASTRAR (somente GERENTE).',
    ),
    409: messageResponse('Já existe um usuário com este e-mail.'),
};
