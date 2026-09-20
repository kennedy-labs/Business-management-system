import { CreateBranchSchema } from './dto/create-branch.dto';
import { UpdateBranchSchema } from './dto/update-branch.dto';

/**
 * These lock in the request-body contract for the branch endpoints.
 *
 * The owning business is never taken from the body (it comes from the
 * x-business-id header), so the schemas must accept bodies without a
 * businessId while still ignoring one that a caller tries to inject.
 */
describe('Branch DTOs', () => {
  describe('CreateBranchSchema', () => {
    it('should accept a body with only a name', () => {
      const parsed = CreateBranchSchema.parse({ name: 'Main Counter' });

      expect(parsed).toEqual({ name: 'Main Counter' });
    });

    it('should still accept a body that includes businessId', () => {
      const parsed = CreateBranchSchema.parse({
        name: 'Main Counter',
        businessId: 'business-1',
      });

      expect(parsed.name).toBe('Main Counter');
      expect(parsed.businessId).toBe('business-1');
    });

    it('should reject a branch with no name', () => {
      expect(() => CreateBranchSchema.parse({})).toThrow();
    });

    it('should reject an empty name', () => {
      expect(() => CreateBranchSchema.parse({ name: '' })).toThrow();
    });

    it('should reject a blank businessId when one is supplied', () => {
      expect(() =>
        CreateBranchSchema.parse({ name: 'Main Counter', businessId: '' }),
      ).toThrow();
    });
  });

  describe('UpdateBranchSchema', () => {
    it('should accept a rename body', () => {
      const parsed = UpdateBranchSchema.parse({ name: 'Back Counter' });

      expect(parsed).toEqual({ name: 'Back Counter' });
    });

    it('should reject an empty name', () => {
      expect(() => UpdateBranchSchema.parse({ name: '' })).toThrow();
    });

    it('should reject a rename with no name', () => {
      expect(() => UpdateBranchSchema.parse({})).toThrow();
    });

    it('should strip an injected businessId so a branch cannot be moved', () => {
      const parsed = UpdateBranchSchema.parse({
        name: 'Back Counter',
        businessId: 'someone-elses-business',
      });

      expect(parsed).toEqual({ name: 'Back Counter' });
      expect('businessId' in parsed).toBe(false);
    });
  });
});