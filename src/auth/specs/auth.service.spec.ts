import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth.service';

jest.mock('openid-client', () => ({
  authorizationCodeGrant: jest.fn(),
  buildAuthorizationUrl: jest.fn(),
  calculatePKCECodeChallenge: jest.fn(),
  discovery: jest.fn(),
  randomNonce: jest.fn(),
  randomPKCECodeVerifier: jest.fn(),
  randomState: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: {
    $transaction: jest.Mock;
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
    };
    oidcGroup: {
      upsert: jest.Mock;
    };
    userGroupMembership: {
      createMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    const runTransaction = (callback: (tx: typeof prismaService) => unknown) =>
      Promise.resolve(callback(prismaService));

    prismaService = {
      $transaction: jest.fn(runTransaction),
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      oidcGroup: {
        upsert: jest.fn(),
      },
      userGroupMembership: {
        createMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('groups'),
            getOrThrow: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('initializes OIDC groups on the first authorized login', async () => {
    prismaService.user.findUnique.mockResolvedValue(null);
    prismaService.user.count.mockResolvedValue(1);
    prismaService.user.create.mockResolvedValue(createUser());
    prismaService.oidcGroup.upsert
      .mockResolvedValueOnce({ id: 'group-1' })
      .mockResolvedValueOnce({ id: 'group-2' });
    prismaService.user.update.mockResolvedValue(
      createUser({ groupsInitializedAt: new Date() }),
    );

    const user = await callUpsertAuthorizedUser(service, {
      issuer: 'https://issuer.example.com',
      subject: 'subject-1',
      email: 'user@example.com',
      displayName: 'User',
      groupExternalIds: ['team-a', 'team-b'],
    });

    expect(user.groupsInitializedAt).toBeInstanceOf(Date);

    expect(prismaService.oidcGroup.upsert).toHaveBeenCalledTimes(2);
    expect(prismaService.userGroupMembership.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-1', groupId: 'group-1' },
        { userId: 'user-1', groupId: 'group-2' },
      ],
      skipDuplicates: true,
    });
  });

  it('does not overwrite initialized group memberships on later login', async () => {
    prismaService.user.findUnique.mockResolvedValue(
      createUser({ groupsInitializedAt: new Date() }),
    );
    prismaService.user.update.mockResolvedValue(
      createUser({ groupsInitializedAt: new Date() }),
    );

    await callUpsertAuthorizedUser(service, {
      issuer: 'https://issuer.example.com',
      subject: 'subject-1',
      groupExternalIds: ['team-a'],
    });

    expect(prismaService.oidcGroup.upsert).not.toHaveBeenCalled();
    expect(prismaService.userGroupMembership.createMany).not.toHaveBeenCalled();
  });
});

function callUpsertAuthorizedUser(
  service: AuthService,
  profile: {
    issuer: string;
    subject: string;
    email?: string;
    displayName?: string;
    groupExternalIds: string[];
  },
) {
  return (
    service as unknown as {
      upsertAuthorizedUser: (input: typeof profile) => Promise<{
        groupsInitializedAt: Date | null;
      }>;
    }
  ).upsertAuthorizedUser(profile);
}

function createUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    oidcIssuer: 'https://issuer.example.com',
    oidcSubject: 'subject-1',
    email: 'user@example.com',
    displayName: 'User',
    role: UserRole.USER,
    groupsInitializedAt: null,
    authorizedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
