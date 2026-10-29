import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_credentials')
export class UserCredential {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, default: 'default_user' })
  owner_id!: string;

  @Column({ type: 'varchar', length: 50, default: 'google' })
  provider!: string;

  @Column({ type: 'text', nullable: true })
  access_token!: string | null;

  @Column({ type: 'text', nullable: true })
  refresh_token!: string | null;

  @Column({ type: 'text', nullable: true })
  scope!: string | null;

  @Column({ type: 'bigint', nullable: true })
  expiry_date!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
