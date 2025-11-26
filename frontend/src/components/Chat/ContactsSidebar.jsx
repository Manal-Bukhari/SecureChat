import React, { useState } from 'react';
import { Search, MessageSquare, UserCheck, RefreshCw, UserPlus, Users } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchContacts, getFriendRequests, fetchGroups, getGroupRequests } from '../../store/slices/chatSlice';
import FriendRequests from './FriendRequests';
import GroupRequests from './GroupRequests';
import AddFriendDialog from './AddFriendDialog';
import CreateGroupDialog from './CreateGroupDialog';
import GroupsList from './GroupsList';

export default function ContactsSidebar({ contacts, activeId, setActiveId }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('messages'); // 'messages', 'requests', or 'groups'
  const [isAddFriendDialogOpen, setIsAddFriendDialogOpen] = useState(false);
  const [isCreateGroupDialogOpen, setIsCreateGroupDialogOpen] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  // Redux state
  const { friendRequests, groupRequests, groups, isFriendRequestsLoading, isContactsLoading, isGroupsLoading } = useSelector(state => state.chat);
  const { userDetails: user } = useSelector((state) => state.user);
  
  // Count of pending received requests for badges
  const pendingFriendRequestsCount = friendRequests?.received?.length || 0;
  const pendingGroupRequestsCount = groupRequests?.received?.length || 0;

  // Local Filter Logic - only filter existing contacts
  const localFiltered = searchTerm
    ? contacts.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : contacts;

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const selectContact = (id) => {
    setActiveId(id);
    navigate(`/chat/${id}`, { replace: true });
  };

  const selectGroup = (groupId) => {
    setActiveId(groupId);
    navigate(`/chat/group/${groupId}`, { replace: true });
  };

  const handleRefreshRequests = () => {
    if (user) {
      dispatch(getFriendRequests());
    }
  };

  const handleRefreshMessages = () => {
    if (user) {
      dispatch(fetchContacts());
    }
  };

  const handleAddFriend = () => {
    setIsAddFriendDialogOpen(true);
  };

  return (
    <aside className="w-80 bg-card border-r border-border flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-semibold text-foreground m-0 leading-tight">Messages</h2>
          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {/* Add Friend button - show on both tabs */}
            <button
              onClick={handleAddFriend}
              className="p-2 rounded-full hover:bg-muted transition-colors"
              title="Add Friend"
            >
              <UserPlus className="h-4 w-4 text-muted-foreground" />
            </button>
            {/* Refresh button for all tabs */}
            {activeTab === 'requests' || activeTab === 'friend-requests' || activeTab === 'group-requests' ? (
              <button
                onClick={() => {
                  dispatch(getFriendRequests());
                  dispatch(getGroupRequests());
                }}
                className="p-2 rounded-full hover:bg-muted transition-colors"
                title="Refresh requests"
                disabled={isFriendRequestsLoading}
              >
                <RefreshCw className={cn("h-4 w-4 text-muted-foreground", isFriendRequestsLoading && "animate-spin")} />
              </button>
            ) : activeTab === 'groups' ? (
              <button
                onClick={() => dispatch(fetchGroups())}
                className="p-2 rounded-full hover:bg-muted transition-colors"
                title="Refresh groups"
                disabled={isGroupsLoading}
              >
                <RefreshCw className={cn("h-4 w-4 text-muted-foreground", isGroupsLoading && "animate-spin")} />
              </button>
            ) : (
              <button
                onClick={handleRefreshMessages}
                className="p-2 rounded-full hover:bg-muted transition-colors"
                title="Refresh contacts"
                disabled={isContactsLoading}
              >
                <RefreshCw className={cn("h-4 w-4 text-muted-foreground", isContactsLoading && "animate-spin")} />
              </button>
            )}
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-1 mb-3 border-b border-border">
          <button
            onClick={() => setActiveTab('messages')}
            className={cn(
              "flex-1 py-2 px-2 text-xs font-medium transition-colors relative",
              activeTab === 'messages'
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="flex items-center justify-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Messages</span>
            </div>
            {activeTab === 'messages' && (
              <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary rounded-full"></span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('friend-requests');
              dispatch(getFriendRequests());
              dispatch(getGroupRequests());
            }}
            className={cn(
              "flex-1 py-2 px-2 text-xs font-medium transition-colors relative",
              activeTab === 'requests' || activeTab === 'friend-requests' || activeTab === 'group-requests'
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="flex items-center justify-center gap-1">
              <UserCheck className="h-3.5 w-3.5" />
              <span>Requests</span>
              {(pendingFriendRequestsCount > 0 || pendingGroupRequestsCount > 0) && (
                <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                  {pendingFriendRequestsCount + pendingGroupRequestsCount}
                </span>
              )}
            </div>
            {(activeTab === 'requests' || activeTab === 'friend-requests' || activeTab === 'group-requests') && (
              <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary rounded-full"></span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('groups');
              dispatch(fetchGroups());
            }}
            className={cn(
              "flex-1 py-2 px-2 text-xs font-medium transition-colors relative",
              activeTab === 'groups'
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="flex items-center justify-center gap-1">
              <Users className="h-3.5 w-3.5" />
              <span>Groups</span>
            </div>
            {activeTab === 'groups' && (
              <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary rounded-full"></span>
            )}
          </button>
        </div>

        {/* Search bar and Create Group button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
              placeholder={
                activeTab === 'messages' ? "Search contacts..." : 
                activeTab === 'requests' || activeTab === 'friend-requests' || activeTab === 'group-requests' ? "Search requests..." : 
                "Search groups..."
              }
              className="w-full pl-10 pr-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
            value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>
          {activeTab === 'groups' && (
            <button
              onClick={() => setIsCreateGroupDialogOpen(true)}
              className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              title="Create Group"
            >
              <Users className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* List Area */}
      <div className="flex-1 overflow-y-auto divide-y divide-border py-2">
        {activeTab === 'requests' || activeTab === 'friend-requests' || activeTab === 'group-requests' ? (
          /* Requests Tab - Show both friend and group requests */
          <div className="flex flex-col h-full">
            <div className="flex gap-2 mb-2 px-2 border-b border-border">
              <button
                onClick={() => setActiveTab('friend-requests')}
                className={cn(
                  "flex-1 py-2 px-2 text-xs font-medium transition-colors relative",
                  activeTab === 'friend-requests' ? "text-primary" : "text-muted-foreground"
                )}
              >
                Friend Requests
                {pendingFriendRequestsCount > 0 && (
                  <span className="ml-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] inline-flex items-center justify-center">
                    {pendingFriendRequestsCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('group-requests')}
                className={cn(
                  "flex-1 py-2 px-2 text-xs font-medium transition-colors relative",
                  activeTab === 'group-requests' ? "text-primary" : "text-muted-foreground"
                )}
              >
                Group Requests
                {pendingGroupRequestsCount > 0 && (
                  <span className="ml-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] inline-flex items-center justify-center">
                    {pendingGroupRequestsCount}
                  </span>
                )}
              </button>
            </div>
            {/* Show appropriate requests based on sub-tab */}
            {activeTab === 'friend-requests' ? (
              <FriendRequests searchTerm={searchTerm} />
            ) : (
              <GroupRequests searchTerm={searchTerm} />
            )}
          </div>
        ) : activeTab === 'groups' ? (
          /* Groups Tab */
          <GroupsList 
            groups={groups} 
            activeGroupId={activeId} 
            setActiveGroupId={selectGroup}
          />
        ) : (
          /* Existing Contacts (Default) */
          <>
            {localFiltered.length > 0 ? localFiltered.map(contact => (
          <button
            key={contact.id}
            onClick={() => selectContact(contact.id)}
            className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 transition-colors text-left",
                  activeId === contact.id ? "bg-primary/10" : "hover:bg-muted"
            )}
          >
            <div className="relative flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-lg font-medium text-primary">
                {contact.name.charAt(0).toUpperCase()}
              </div>
              {contact.isOnline && (
                    <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-background bg-success" />
              )}
            </div>
            <div className="flex-1 overflow-hidden">
                  <div className="flex justify-between items-baseline">
                    <p className="text-sm font-medium text-foreground truncate">{contact.name}</p>
                    <span className="text-[10px] text-muted-foreground">{contact.lastSeen === 'Online' ? '' : contact.lastSeen}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {contact.lastMessage || "Tap to chat"}
              </p>
            </div>
          </button>
        )) : (
              <div className="p-8 text-center">
                <p className="text-muted-foreground">
                  {searchTerm ? `No contacts found matching "${searchTerm}"` : "No contacts found."}
                </p>
          </div>
            )}
          </>
        )}
      </div>

      {/* Add Friend Dialog */}
      <AddFriendDialog 
        open={isAddFriendDialogOpen} 
        onOpenChange={setIsAddFriendDialogOpen} 
      />

      {/* Create Group Dialog */}
      <CreateGroupDialog 
        open={isCreateGroupDialogOpen} 
        onOpenChange={setIsCreateGroupDialogOpen}
        onGroupCreated={() => {
          setActiveTab('groups');
          dispatch(fetchGroups());
        }}
      />
    </aside>
  );
}
