// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA6u9jZvo9ZYT6mzoR6eGRvKZDQNQPnTog",
  authDomain: "coremetric-cev.firebaseapp.com",
  projectId: "coremetric-cev",
  storageBucket: "coremetric-cev.firebasestorage.app",
  messagingSenderId: "640066501536",
  appId: "1:640066501536:web:01a18e0dfa9271dc5182c5"
};




// Initialize Firebase only if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    // Use LOCAL persistence so mobile redirect flow doesn't lose session
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Collections
const USERS_COLLECTION = "users";
const CUSTOMERS_COLLECTION = "customers";
const SETTINGS_COLLECTION = "settings";

// Authentication State Manager
let currentUser = null;
let currentUserRole = null;
let currentUserData = null;

// Check authentication and redirect if needed
async function checkAuthAndRedirect() {
    return new Promise((resolve, reject) => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            unsubscribe();
            
            if (user) {
                currentUser = user;
                
                // Get user data from Firestore - TRY BOTH METHODS (uid and email)
                try {
                    // TRY 1: Check by EMAIL (primary method)
                    let userDoc = await db.collection(USERS_COLLECTION).doc(user.email).get();
                    
                    // TRY 2: If not found, check by UID (backward compatibility)
                    if (!userDoc.exists) {
                        userDoc = await db.collection(USERS_COLLECTION).doc(user.uid).get();
                    }
                    
                    if (!userDoc.exists) {
                        // User not authorized - sign out and redirect to login
                        console.log("User not found in users collection:", user.email);
                        await auth.signOut();
                        if (!window.location.pathname.includes('index.html')) {
                            window.location.href = 'index.html?error=unauthorized';
                        }
                        reject(new Error('User not authorized'));
                        return;
                    }
                    
                    // User found
                    currentUserData = userDoc.data();
                    currentUserRole = currentUserData.role || 'staff';
                    
                    // Check if user is active
                    if (currentUserData.status === 'inactive') {
                        await auth.signOut();
                        if (!window.location.pathname.includes('index.html')) {
                            window.location.href = 'index.html?error=inactive';
                        }
                        reject(new Error('Account inactive'));
                        return;
                    }
                    
                    // Update last login
                    try {
                        await db.collection(USERS_COLLECTION).doc(user.email).update({
                            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                            photoURL: user.photoURL || currentUserData.photoURL,
                            displayName: user.displayName || currentUserData.displayName
                        });
                        
                        // Also update by UID for backward compatibility
                        await db.collection(USERS_COLLECTION).doc(user.uid).set({
                            email: user.email,
                            displayName: user.displayName || currentUserData.displayName,
                            photoURL: user.photoURL || currentUserData.photoURL,
                            role: currentUserData.role,
                            nickname: currentUserData.nickname || '',
                            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                    } catch (updateError) {
                        console.log("Could not update last login:", updateError);
                    }
                    
                    resolve(user);
                } catch (error) {
                    console.error("Error checking user:", error);
                    reject(error);
                }
            } else {
                // Not authenticated
                currentUser = null;
                currentUserRole = null;
                currentUserData = null;
                
                // Only redirect if not on login page
                if (!window.location.pathname.includes('index.html') && 
                    !window.location.pathname.includes('login.html')) {
                    sessionStorage.setItem('redirectAfterLogin', window.location.href);
                    window.location.href = 'index.html';
                }
                reject(new Error('Not authenticated'));
            }
        }, reject);
    });
}

// Sign out function
async function signOut() {
    try {
        await auth.signOut();
        currentUser = null;
        currentUserRole = null;
        currentUserData = null;
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Sign out error:', error);
        throw error;
    }
}

// Get current user
function getCurrentUser() {
    return currentUser || auth.currentUser;
}

// Get user ID (Firebase UID)
function getUserId() {
    const user = currentUser || auth.currentUser;
    return user ? user.uid : null;
}

// Get user email
function getUserEmail() {
    const user = currentUser || auth.currentUser;
    return user ? user.email : null;
}

// Get current user role
async function getUserRole() {
    try {
        if (currentUserRole) return currentUserRole;
        
        const user = auth.currentUser;
        if (!user) return null;
        
        // Try by email first
        let userDoc = await db.collection(USERS_COLLECTION).doc(user.email).get();
        if (!userDoc.exists) {
            userDoc = await db.collection(USERS_COLLECTION).doc(user.uid).get();
        }
        
        if (userDoc.exists) {
            currentUserRole = userDoc.data().role || 'staff';
            return currentUserRole;
        }
        return null;
    } catch (error) {
        console.error('Error getting user role:', error);
        return null;
    }
}

// Get user profile data
async function getUserProfile() {
    try {
        if (currentUserData) return currentUserData;
        
        const user = auth.currentUser;
        if (!user) return null;
        
        // Try by email first
        let userDoc = await db.collection(USERS_COLLECTION).doc(user.email).get();
        if (!userDoc.exists) {
            userDoc = await db.collection(USERS_COLLECTION).doc(user.uid).get();
        }
        
        if (userDoc.exists) {
            currentUserData = userDoc.data();
            return currentUserData;
        }
        return null;
    } catch (error) {
        console.error('Error getting user profile:', error);
        return null;
    }
}

// Update user nickname
async function updateUserNickname(nickname) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');
        
        const updateData = {
            nickname: nickname,
            displayName: nickname, // Use nickname as display name
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Save using email as document ID (primary)
        await db.collection(USERS_COLLECTION).doc(user.email).set(updateData, { merge: true });
        
        // Also save by uid for backward compatibility
        await db.collection(USERS_COLLECTION).doc(user.uid).set({
            ...updateData,
            email: user.email
        }, { merge: true });
        
        // Update cached data
        if (currentUserData) {
            currentUserData.nickname = nickname;
            currentUserData.displayName = nickname;
        }
        
        return true;
    } catch (error) {
        console.error('Error updating nickname:', error);
        throw error;
    }
}

// ==================== ADMIN MANAGEMENT FUNCTIONS ====================

// Admin: Add new user
async function addUser(email, role) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('Not authenticated');
        
        // Check if current user is admin
        const currentUserRole = await getUserRole();
        if (currentUserRole !== 'admin') {
            throw new Error('Unauthorized: Only admins can add users');
        }
        
        // Validate email
        if (!email || !email.includes('@')) {
            throw new Error('Invalid email address');
        }
        
        // Check if user already exists (by email)
        const existingUser = await db.collection(USERS_COLLECTION).doc(email).get();
        if (existingUser.exists) {
            throw new Error('User already exists');
        }
        
        // Add new user with email as document ID
        await db.collection(USERS_COLLECTION).doc(email).set({
            email: email,
            role: role,
            status: 'active',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser.email,
            lastLogin: null,
            displayName: email.split('@')[0],
            nickname: ''
        });
        
        return {
            success: true,
            message: `User ${email} added successfully as ${role}`
        };
    } catch (error) {
        console.error('Error adding user:', error);
        throw error;
    }
}

// Admin: Update user role (promote/demote)
async function updateUserRole(email, newRole) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('Not authenticated');
        
        // Check if current user is admin
        const currentUserRole = await getUserRole();
        if (currentUserRole !== 'admin') {
            throw new Error('Unauthorized: Only admins can update user roles');
        }
        
        // Get all users to check admin count
        const allUsers = await db.collection(USERS_COLLECTION).get();
        const adminUsers = allUsers.docs.filter(doc => doc.data().role === 'admin');
        const adminCount = adminUsers.length;
        
        // Check if target user exists
        const targetUserDoc = await db.collection(USERS_COLLECTION).doc(email).get();
        if (!targetUserDoc.exists) {
            throw new Error('User not found');
        }
        
        const targetUser = targetUserDoc.data();
        
        // If demoting an admin, ensure at least one admin remains
        if (targetUser.role === 'admin' && newRole === 'staff') {
            if (adminCount <= 1) {
                throw new Error('Cannot demote the last admin. At least one admin must remain in the system.');
            }
        }
        
        // Update user role
        await db.collection(USERS_COLLECTION).doc(email).update({
            role: newRole,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser.email
        });
        
        // Also update by UID if exists
        if (targetUser.uid) {
            await db.collection(USERS_COLLECTION).doc(targetUser.uid).update({
                role: newRole,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(err => console.log('Could not update by UID:', err));
        }
        
        return {
            success: true,
            message: `User ${email} role updated to ${newRole}`
        };
    } catch (error) {
        console.error('Error updating user role:', error);
        throw error;
    }
}

// Admin: Toggle user status (active/inactive)
async function toggleUserStatus(email, status) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('Not authenticated');
        
        // Check if current user is admin
        const currentUserRole = await getUserRole();
        if (currentUserRole !== 'admin') {
            throw new Error('Unauthorized: Only admins can change user status');
        }
        
        // Prevent deactivating yourself
        if (email === currentUser.email && status === 'inactive') {
            throw new Error('Cannot deactivate your own account');
        }
        
        // Check if target user exists
        const targetUserDoc = await db.collection(USERS_COLLECTION).doc(email).get();
        if (!targetUserDoc.exists) {
            throw new Error('User not found');
        }
        
        const targetUser = targetUserDoc.data();
        
        // If deactivating an admin, ensure at least one active admin remains
        if (targetUser.role === 'admin' && status === 'inactive') {
            const allUsers = await db.collection(USERS_COLLECTION).get();
            const activeAdmins = allUsers.docs.filter(doc => 
                doc.data().role === 'admin' && 
                doc.data().status === 'active' &&
                doc.id !== email
            );
            
            if (activeAdmins.length === 0) {
                throw new Error('Cannot deactivate the last active admin. At least one active admin must remain.');
            }
        }
        
        await db.collection(USERS_COLLECTION).doc(email).update({
            status: status,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser.email
        });
        
        // Also update by UID if exists
        if (targetUser.uid) {
            await db.collection(USERS_COLLECTION).doc(targetUser.uid).update({
                status: status,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(err => console.log('Could not update by UID:', err));
        }
        
        return {
            success: true,
            message: `User ${email} ${status === 'active' ? 'activated' : 'deactivated'} successfully`
        };
    } catch (error) {
        console.error('Error toggling user status:', error);
        throw error;
    }
}

// Admin: Remove user
async function removeUser(email) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('Not authenticated');
        
        // Check if current user is admin
        const currentUserRole = await getUserRole();
        if (currentUserRole !== 'admin') {
            throw new Error('Unauthorized: Only admins can remove users');
        }
        
        // Prevent removing yourself
        if (email === currentUser.email) {
            throw new Error('Cannot remove your own account');
        }
        
        // Get all users to check admin count
        const allUsers = await db.collection(USERS_COLLECTION).get();
        const adminUsers = allUsers.docs.filter(doc => doc.data().role === 'admin');
        const adminCount = adminUsers.length;
        
        // Check if target user exists
        const targetUserDoc = await db.collection(USERS_COLLECTION).doc(email).get();
        if (!targetUserDoc.exists) {
            throw new Error('User not found');
        }
        
        const targetUser = targetUserDoc.data();
        
        // If removing an admin, ensure at least one admin remains
        if (targetUser.role === 'admin') {
            if (adminCount <= 1) {
                throw new Error('Cannot remove the last admin. At least one admin must remain in the system.');
            }
        }
        
        // Store UID for cleanup if exists
        const uid = targetUser.uid;
        
        // Remove user by email
        await db.collection(USERS_COLLECTION).doc(email).delete();
        
        // Also remove by UID if exists and different from email
        if (uid && uid !== email) {
            await db.collection(USERS_COLLECTION).doc(uid).delete().catch(err => 
                console.log('Could not delete by UID:', err)
            );
        }
        
        return {
            success: true,
            message: `User ${email} removed successfully`
        };
    } catch (error) {
        console.error('Error removing user:', error);
        throw error;
    }
}

// Get all users (admin only)
async function getAllUsers() {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) return [];
        
        // Check if current user is admin
        const currentUserRole = await getUserRole();
        if (currentUserRole !== 'admin') {
            return []; // Non-admins can't see all users
        }
        
        const snapshot = await db.collection(USERS_COLLECTION)
            .orderBy('createdAt', 'desc')
            .get();
        
        // Process users to ensure unique entries by email
        const userMap = new Map();
        
        snapshot.forEach(doc => {
            const userData = doc.data();
            const email = userData.email || doc.id;
            
            // Only keep if email not already in map, or this entry has more complete data
            if (!userMap.has(email) || 
                (userData.role && !userMap.get(email).role) ||
                (userData.nickname && !userMap.get(email).nickname)) {
                userMap.set(email, {
                    id: doc.id,
                    ...userData,
                    email: email
                });
            }
        });
        
        return Array.from(userMap.values());
    } catch (error) {
        console.error('Error getting users:', error);
        return [];
    }
}

// Check if current user is admin
async function isAdmin() {
    const role = await getUserRole();
    return role === 'admin';
}

// Initialize first admin user (call this once when setting up the system)
async function initializeFirstAdmin(email) {
    try {
        // Check if any admin exists
        const snapshot = await db.collection(USERS_COLLECTION)
            .where('role', '==', 'admin')
            .get();
        
        if (snapshot.empty) {
            // No admin exists, create one
            await db.collection(USERS_COLLECTION).doc(email).set({
                email: email,
                role: 'admin',
                status: 'active',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                displayName: email.split('@')[0],
                nickname: '',
                isFirstAdmin: true
            });
            console.log('First admin user created:', email);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error initializing first admin:', error);
        return false;
    }
}

// ==================== ORIGINAL FUNCTIONS ====================

async function getSettings() {
    try {
        const userId = getUserId();
        if (!userId) return null;
        
        const doc = await db.collection(SETTINGS_COLLECTION).doc(userId).get();
        if (doc.exists) {
            return doc.data();
        } else {
            // Create default settings if not exists
            const defaultSettings = {
                rates: { cubeTest: 1000, gsbTest: 1500 },
                sieveSizes: ["75.0", "53.0", "26.5", "9.50", "4.75", "2.36", "0.425", "0.075"],
                cubeDefaults: { age: '14', grade: 'M25' },
                theme: 'light',
                created: firebase.firestore.FieldValue.serverTimestamp(),
                updated: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection(SETTINGS_COLLECTION).doc(userId).set(defaultSettings);
            return defaultSettings;
        }
    } catch (error) {
        console.error("Error getting settings:", error);
        return null;
    }
}

// Customer Management - MODIFIED to show all customers (no filter)
async function getCustomers() {
    try {
        const userId = getUserId();
        if (!userId) return [];
        
        console.log("Getting all customers (no filter for backward compatibility)...");
        
        // Get ALL customers (no filter)
        const snapshot = await db.collection(CUSTOMERS_COLLECTION)
            .orderBy("createdDate", "desc")
            .get();
        
        const customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Found ${customers.length} total customers`);
        
        return customers;
    } catch (error) {
        console.error("Error getting customers:", error);
        // Try without orderBy as fallback
        try {
            const snapshot = await db.collection(CUSTOMERS_COLLECTION).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (fallbackError) {
            console.error("Fallback also failed:", fallbackError);
            return [];
        }
    }
}

// For autocomplete
async function getAllCustomers() {
    try {
        const snapshot = await db.collection(CUSTOMERS_COLLECTION).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error getting all customers:", error);
        return [];
    }
}

async function addCustomer(customerData) {
    try {
        const userId = getUserId();
        if (!userId) throw new Error("User not authenticated");
        
        const customer = {
            ...customerData,
            userId: userId,
            createdDate: firebase.firestore.FieldValue.serverTimestamp(),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
            cubeTests: customerData.cubeTests || [],
            gsbTests: customerData.gsbTests || []
        };
        
        const docRef = await db.collection(CUSTOMERS_COLLECTION).add(customer);
        return { id: docRef.id, ...customer };
    } catch (error) {
        console.error("Error adding customer:", error);
        throw error;
    }
}

async function updateCustomer(customerId, customerData) {
    try {
        const userId = getUserId();
        if (!userId) throw new Error("User not authenticated");
        
        const customer = {
            ...customerData,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection(CUSTOMERS_COLLECTION).doc(customerId).update(customer);
        return { id: customerId, ...customer };
    } catch (error) {
        console.error("Error updating customer:", error);
        throw error;
    }
}

async function deleteCustomer(customerId) {
    try {
        await db.collection(CUSTOMERS_COLLECTION).doc(customerId).delete();
        return true;
    } catch (error) {
        console.error("Error deleting customer:", error);
        throw error;
    }
}

// Initialize user data on first login (called from index.html)
async function initializeUserData(user) {
    try {
        // Check if user already exists
        const existingUser = await db.collection(USERS_COLLECTION).doc(user.email).get();
        
        if (!existingUser.exists) {
            // New user - but they shouldn't be here because login is blocked
            console.log("Unauthorized user attempted to initialize:", user.email);
            await auth.signOut();
            return false;
        }
        
        // Update existing user with latest info
        await db.collection(USERS_COLLECTION).doc(user.email).set({
            email: user.email,
            uid: user.uid,
            displayName: user.displayName || existingUser.data().displayName,
            photoURL: user.photoURL || existingUser.data().photoURL,
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // Also update by uid for backward compatibility
        await db.collection(USERS_COLLECTION).doc(user.uid).set({
            email: user.email,
            displayName: user.displayName || existingUser.data().displayName,
            photoURL: user.photoURL || existingUser.data().photoURL,
            role: existingUser.data().role,
            nickname: existingUser.data().nickname || '',
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        return true;
    } catch (error) {
        console.error("Error initializing user data:", error);
        return false;
    }
}

const HISTORY_LOG_COLLECTION = 'history_log';

async function logHistory(action, details, extraInfo = '') {
    try {
        const user = auth.currentUser;
        const userEmail = user ? user.email : 'unknown';
        // Try to get nickname
        let displayName = userEmail;
        try {
            const userDoc = await db.collection(USERS_COLLECTION).doc(userEmail).get();
            if (userDoc.exists && userDoc.data().nickname) {
                displayName = `${userDoc.data().nickname} (${userEmail})`;
            }
        } catch(e) {}
        
        const entry = {
            action, // 'add' | 'update' | 'delete'
            details,
            extraInfo: extraInfo || '',
            by: displayName,
            byEmail: userEmail,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection(HISTORY_LOG_COLLECTION).add(entry);
    } catch(e) {
        console.warn('History log error:', e);
    }
}

// Export to window
window.firebaseHelpers = {
    auth,
    db,
    checkAuthAndRedirect,
    signOut,
    getCurrentUser,
    getUserId,
    getUserEmail,
    getUserRole,
    getUserProfile,
    updateUserNickname,
    addUser,
    updateUserRole,
    toggleUserStatus,
    removeUser,
    getAllUsers,
    isAdmin,
    initializeFirstAdmin,
    getSettings,
    getCustomers,
    getAllCustomers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    initializeUserData,
    logHistory,
    USERS_COLLECTION,
    CUSTOMERS_COLLECTION,
    SETTINGS_COLLECTION
};

// Auto-initialize: Check if we need to create first admin (run once)
(async function() {
    try {
        // This is just for setup - will only run if no admin exists
        // You can call this manually when setting up the system
        // Example: firebaseHelpers.initializeFirstAdmin('your-email@gmail.com')
    } catch (error) {
        console.error('Auto-init error:', error);
    }
})();