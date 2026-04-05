# **PropAI Testing Strategy - Sprint 2-4 Features**

## **Testing Standards & Conventions**

### **Naming Conventions**
- **API Tests**: `{feature}.test.ts` (e.g., `lease-edit.test.ts`)
- **Frontend Tests**: `{ComponentName}.test.tsx` 
- **Test Files Location**: 
  - API: `apps/api/src/__tests__/`
  - Frontend: `apps/web/src/{path}/__tests__/`

### **Test Structure Standards**
```typescript
describe("{Feature Name}", () => {
  describe("{HTTP Method} {endpoint}", () => {
    it("should {expected behavior}", async () => {
      // Arrange, Act, Assert
    });
  });
});
```

### **Required Test Categories**
1. **Happy Path**: Core functionality works as expected
2. **Error Handling**: Validation errors, API failures, network issues  
3. **Security**: Role-based access, cross-org isolation, input sanitization
4. **Edge Cases**: Boundary conditions, empty states, race conditions
5. **Integration**: Component interactions, API integration

---

## **Sprint 2: Lease Edit Feature**

### **Backend API Tests** (`lease-edit.test.ts`)

#### **PUT /leases/:id - Update Lease**
- [ ] **Happy Path**
  - Update lease dates successfully
  - Update rent amount successfully  
  - Update tenant assignment
  - Update lease status (ACTIVE → TERMINATED)
- [ ] **Security & Access Control**
  - Require ADMIN/OWNER role
  - Block cross-organization access 
  - Block editing terminated leases
  - Validate lease belongs to user's organization
- [ ] **Validation**
  - Start date cannot be after end date
  - Rent amount must be positive decimal
  - Tenant must exist in organization
  - Unit must exist and not be archived
- [ ] **Business Logic**
  - Cannot modify active lease to overlap with other active leases
  - Cannot set start date in the past (beyond grace period)
  - Audit logging for lease modifications
- [ ] **Edge Cases**
  - Handle concurrent lease updates
  - Validate decimal precision for rent amounts

#### **GET /leases/:id - Get Lease Details**
- [ ] Retrieve lease with tenant and unit information
- [ ] Handle non-existent lease (404)
- [ ] Cross-org access prevention

### **Frontend Component Tests**

#### **LeaseEditDrawer.test.tsx**
- [ ] **Rendering**
  - Display current lease information
  - Form fields populated with existing data
  - Proper form validation messages
- [ ] **Form Interactions** 
  - Update dates with date picker
  - Update rent amount with number input
  - Submit form with valid data
  - Handle form validation errors
- [ ] **API Integration**
  - Mock successful lease update
  - Mock validation errors (400)
  - Mock permission errors (403)
  - Handle loading states during API calls
- [ ] **User Experience**
  - Close drawer on successful update
  - Display success notification
  - Display error messages
  - Prevent duplicate submissions

#### **UnitCard.test.tsx** (Updated for inline edit)
- [ ] **Archive Integration**
  - Show "Edit Lease" button for active leases
  - Hide edit button for archived units
  - Open LeaseEditDrawer on button click
- [ ] **State Management**
  - Update lease data after successful edit
  - Refresh unit display after lease changes

---

## **Sprint 3: Maintenance Feature**

### **Backend API Tests** (`maintenance.test.ts`)

#### **POST /maintenance - Create Maintenance Request**
- [ ] **Happy Path**
  - Create maintenance for property
  - Create maintenance for specific unit
  - Set priority levels (LOW, MEDIUM, HIGH, URGENT)
- [ ] **Security & Validation**
  - Require authenticated user
  - Validate property/unit ownership
  - Sanitize description input 
  - Prevent XSS in maintenance notes
- [ ] **Business Logic**
  - Auto-assign maintenance to property owner
  - Generate unique maintenance ticket number
  - Send notification to relevant parties
  - Audit log maintenance creation

#### **GET /maintenance - List Maintenance Requests**
- [ ] **Filtering**
  - Filter by property
  - Filter by unit
  - Filter by status (OPEN, IN_PROGRESS, COMPLETED)
  - Filter by priority
- [ ] **Pagination & Sorting**
  - Paginated results
  - Sort by date created
  - Sort by priority
  - Organization-scoped results only

#### **PATCH /maintenance/:id - Update Maintenance Status**
- [ ] Update status transitions
- [ ] Add progress notes
- [ ] Handle completion with cost tracking

### **Frontend Component Tests**

#### **MaintenancePanel.test.tsx**
- [ ] **Property/Unit Filtering**
  - Filter maintenance by selected property
  - Filter by specific unit
  - Clear filters functionality
- [ ] **Status Management** 
  - Display color-coded status badges
  - Update status via dropdown
  - Confirm critical status changes
- [ ] **Create New Maintenance**
  - Open maintenance creation modal
  - Form validation (description, priority)
  - Submit new maintenance request

#### **MaintenanceCreateModal.test.tsx**
- [ ] **Form Handling**
  - Property/unit selection dropdown
  - Priority selection
  - Description textarea validation
  - Image upload for maintenance issues

---

## **Sprint 4: Documents Feature**

### **Backend API Tests** (`documents.test.ts`)

#### **POST /properties/:id/documents - Upload Document**
- [ ] **File Upload**
  - Single file upload success
  - Multiple file upload support
  - Validate file types (PDF, images, docs)
  - File size limits (10MB max)
- [ ] **Security**
  - Virus scanning integration
  - File type validation
  - Prevent executable uploads
  - Organization-scoped access
- [ ] **Metadata**
  - Store original filename
  - Generate secure storage path
  - Track upload timestamp and user

#### **GET /properties/:id/documents - List Documents**
- [ ] List documents for property
- [ ] Include file metadata (size, type, date)
- [ ] Paginated results

#### **GET /documents/:id/download - Download Document**
- [ ] **Security**
  - Verify user has access to property
  - Generate temporary download URLs
  - Prevent direct file access
- [ ] **Performance**
  - Support range requests for large files
  - Proper caching headers

#### **DELETE /documents/:id - Delete Document**
- [ ] Soft delete with audit trail
- [ ] Require ADMIN/OWNER permissions
- [ ] Remove from file storage

### **Frontend Component Tests**

#### **DocumentsPanel.test.tsx**
- [ ] **File List Display**
  - Show document names, sizes, upload dates
  - File type icons
  - Download buttons for each document
- [ ] **Upload Functionality**
  - Drag & drop interface
  - File picker modal
  - Upload progress indicators
  - Handle upload errors
- [ ] **File Management**
  - Delete documents with confirmation
  - Rename document capability
  - Bulk selection and operations

#### **DocumentUploadModal.test.tsx**
- [ ] **File Validation** 
  - Accept only allowed file types
  - Reject oversized files
  - Display validation errors
- [ ] **Upload Progress**
  - Progress bar during upload
  - Cancel upload capability
  - Success/error notifications

---

## **Test Execution Strategy**

### **Pre-Sprint Setup**
1. **Database Setup**: Ensure test database with proper migrations
2. **Mock Data**: Create comprehensive test fixtures
3. **CI Integration**: Run tests on every PR
4. **Coverage Goals**: Maintain 85%+ test coverage

### **Sprint Testing Workflow**
1. **TDD Approach**: Write tests before implementation
2. **Component Testing**: Test components in isolation with mocked dependencies  
3. **Integration Testing**: Validate API + frontend integration
4. **Manual Testing**: UX validation before sprint completion

### **Quality Gates**
- [ ] All unit tests pass
- [ ] No security test failures
- [ ] API response time < 200ms for 95% of requests
- [ ] Frontend component tests cover all user interactions
- [ ] Error handling tests cover all failure scenarios

### **Test Maintenance**
- **Flaky Test Policy**: Fix or remove flaky tests within 24 hours
- **Test Documentation**: Update test plan for any requirement changes
- **Performance Monitoring**: Track test execution time trends
- **Coverage Tracking**: Monitor and maintain test coverage metrics

---

## **Tools & Commands**

### **API Testing**
```bash
# Run all API tests
pnpm -C apps/api test

# Run specific feature tests  
pnpm -C apps/api test -- lease-edit.test.ts

# Run tests with coverage
pnpm -C apps/api test -- --coverage
```

### **Frontend Testing**
```bash
# Run all frontend tests
pnpm -C apps/web test

# Watch mode during development
pnpm -C apps/web test:watch

# UI mode for interactive testing
pnpm -C apps/web test:ui
```

### **Integration Testing**
```bash
# Run full test suite across apps
pnpm test-all  # (requires setup in root package.json)
```