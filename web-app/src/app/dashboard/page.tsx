"use client";

import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card, { CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-600">Welcome to the Beckley Retreats Program Operations dashboard.</p>
      </div>
      
      {/* Dashboard stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {dashboardStats.map((stat, index) => (
          <Card key={index} className="flex flex-col">
            <CardContent>
              <p className="text-sm font-medium text-gray-500">{stat.label}</p>
              <p className="mt-1 text-3xl font-semibold">{stat.value}</p>
              <div className="mt-2">
                <span className={`inline-flex items-center text-sm ${
                  stat.change > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stat.change > 0 ? '↑' : '↓'} {Math.abs(stat.change)}% from last month
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {/* Recent activities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Pending Screenings</CardTitle>
            <CardDescription>Applicants waiting for screening calls</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingScreenings.map((item, index) => (
                <div key={index} className="flex items-center justify-between border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-gray-500">Applied: {item.appliedDate}</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Review
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="secondary" fullWidth>View All Pending Screenings</Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Retreats</CardTitle>
            <CardDescription>Scheduled retreats in the next 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingRetreats.map((item, index) => (
                <div key={index} className="flex items-center justify-between border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-gray-500">{item.date} • {item.participants} participants</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Details
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="secondary" fullWidth>View All Retreats</Button>
          </CardFooter>
        </Card>
      </div>
    </DashboardLayout>
  );
}

// Mock data for dashboard
const dashboardStats = [
  { label: 'Pending Screenings', value: 18, change: 12 },
  { label: 'Completed Today', value: 5, change: -8 },
  { label: 'Upcoming Calls', value: 8, change: 25 },
  { label: 'Approved Participants', value: 42, change: 18 },
];

const pendingScreenings = [
  { name: 'John Smith', appliedDate: 'April 12, 2025' },
  { name: 'Emma Johnson', appliedDate: 'April 14, 2025' },
  { name: 'Michael Brown', appliedDate: 'April 15, 2025' },
  { name: 'Sarah Wilson', appliedDate: 'April 16, 2025' },
];

const upcomingRetreats = [
  { name: 'Costa Rica Retreat', date: 'April 22-28, 2025', participants: 15 },
  { name: 'Mexico Retreat', date: 'May 5-12, 2025', participants: 12 },
  { name: 'Jamaica Retreat', date: 'May 18-24, 2025', participants: 18 },
];
