import type { Email } from '../../../shared/domain/email.js';
import type { User } from './user.js';

export interface UserRepository {
    save(user: User): Promise<void>;
    findByEmail(email: Email): Promise<User | null>;
}
