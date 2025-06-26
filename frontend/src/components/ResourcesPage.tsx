'use client'

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Check, AlertCircle } from 'lucide-react';

const ResourcesPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-500" />
            ISCI Program Resources
          </CardTitle>
          <CardDescription>
            Helpful resources for planning your ISCI degree
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Official Program Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-700">Official Program Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2">UBC ISCI Program</h4>
                  <p className="text-sm text-gray-600 mb-3">Official program requirements and information</p>
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://isci.ubc.ca/" target="_blank" rel="noopener noreferrer">
                      Visit ISCI Website
                    </a>
                  </Button>
                </CardContent>
              </Card>
              
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2">Academic Calendar</h4>
                  <p className="text-sm text-gray-600 mb-3">Detailed program requirements and course descriptions</p>
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://calendar.ubc.ca/vancouver/index.cfm?tree=12,215,410,1635" target="_blank" rel="noopener noreferrer">
                      View Calendar
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Stream Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-700">Program Streams</h3>
            <div className="space-y-4">
              <Card className="bg-blue-50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="default" className="mt-1">Regular</Badge>
                    <div>
                      <h4 className="font-medium mb-2">Regular Stream Requirements</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• 2-3 disciplines (excluding ISCI)</li>
                        <li>• 7+ ISCI credits</li>
                        <li>• 33+ total discipline credits</li>
                        <li>• 40+ total science credits (max 10 honorary)</li>
                        <li>• 27+ science credits in non-ISCI disciplines</li>
                        <li>• 12+ credits of 400-level courses</li>
                        <li>• At least 3 credits of 400-level in each discipline</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-purple-50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="secondary" className="mt-1">Honours</Badge>
                    <div>
                      <h4 className="font-medium mb-2">Honours Stream Requirements</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• 2-3 disciplines (excluding ISCI)</li>
                        <li>• 13+ ISCI credits including ISCI 449</li>
                        <li>• 42+ total discipline credits</li>
                        <li>• 49+ total science credits (max 7 honorary)</li>
                        <li>• 27+ science credits in non-ISCI disciplines</li>
                        <li>• 18+ credits of 400-level courses</li>
                        <li>• At least 3 credits of 400-level in each discipline</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Planning Tips */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-700">Planning Tips</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    Course Selection
                  </h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Choose disciplines that complement each other</li>
                    <li>• Check prerequisites for 400-level courses</li>
                    <li>• Consider your career goals</li>
                    <li>• Balance theoretical and practical courses</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    Common Mistakes
                  </h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Not checking course availability</li>
                    <li>• Forgetting about honorary credit limits</li>
                    <li>• Missing 400-level requirements</li>
                    <li>• Not consulting with advisors</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Contact Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-700">Need Help?</h3>
            <Card className="bg-gray-50">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Academic Advising</h4>
                    <p className="text-sm text-gray-600 mb-2">For questions about course planning and requirements</p>
                    <Button variant="outline" size="sm" asChild>
                      <a href="mailto:isci.advisor@ubc.ca">Contact Advisor</a>
                    </Button>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Program Coordinator</h4>
                    <p className="text-sm text-gray-600 mb-2">For general program inquiries</p>
                    <Button variant="outline" size="sm" asChild>
                      <a href="mailto:isci@ubc.ca">Contact Coordinator</a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResourcesPage;
